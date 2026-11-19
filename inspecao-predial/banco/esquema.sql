-- Banco do app Inspeção de Cobertura (Neon, projeto "inspecao-predial").
--
-- Pré-requisitos no projeto Neon (feitos pelo console ou pela API):
--   * Neon Auth (Better Auth) ativado no banco neondb;
--   * API de dados ativada com Neon Auth, expondo só o esquema public,
--     SEM as permissões padrão (as permissões estão abaixo);
--   * bucket privado "fotos" no armazenamento de objetos.
--
-- Segurança: o app fala com o banco direto pelo navegador (API de dados).
-- Quem decide o que cada pessoa vê é o próprio Postgres, com as regras de
-- linha (RLS) abaixo e o usuário que vem do token de login (auth.user_id()).
-- Visitante sem login não tem permissão em nada.

-- ---------- equipe ----------

create table public.membros (
  user_id text primary key,
  email text not null default '',
  nome text not null default '',
  papel text not null default 'tecnico' check (papel in ('admin', 'tecnico')),
  aprovado boolean not null default false,
  criado_em timestamptz not null default now(),
  aprovado_em timestamptz
);
comment on table public.membros is 'Equipe do app de inspeção. A primeira conta vira admin; as demais esperam aprovação.';

create function public.eh_membro() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membros m where m.user_id = auth.user_id() and m.aprovado) $$;

create function public.eh_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membros m where m.user_id = auth.user_id() and m.aprovado and m.papel = 'admin') $$;

-- Chamada após o login: registra a pessoa na equipe (a primeira vira admin).
create function public.entrar() returns public.membros
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.membros;
  uid text := auth.user_id();
  claims jsonb := auth.jwt();
begin
  if uid is null then
    raise exception 'Sessão inválida' using errcode = '28000';
  end if;
  select * into v from public.membros where user_id = uid;
  if found then
    update public.membros set email = coalesce(claims->>'email', email), nome = coalesce(nullif(claims->>'name', ''), nome)
      where user_id = uid returning * into v;
    return v;
  end if;
  perform pg_advisory_xact_lock(hashtext('membros.primeiro_admin'));
  if not exists (select 1 from public.membros where papel = 'admin' and aprovado) then
    insert into public.membros (user_id, email, nome, papel, aprovado, aprovado_em)
      values (uid, coalesce(claims->>'email', ''), coalesce(claims->>'name', ''), 'admin', true, now())
      returning * into v;
  else
    insert into public.membros (user_id, email, nome)
      values (uid, coalesce(claims->>'email', ''), coalesce(claims->>'name', ''))
      returning * into v;
  end if;
  return v;
end $$;

-- Nunca deixa a equipe sem um administrador aprovado.
create function public.membros_protege_admin() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.aprovado and not old.aprovado then
    new.aprovado_em := now();
  end if;
  if old.papel = 'admin' and old.aprovado
     and (tg_op = 'DELETE' or not (new.papel = 'admin' and new.aprovado))
     and not exists (select 1 from public.membros where papel = 'admin' and aprovado and user_id <> old.user_id) then
    raise exception 'A equipe precisa de pelo menos um administrador aprovado';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger membros_protege_admin before update or delete on public.membros
  for each row execute function public.membros_protege_admin();

alter table public.membros enable row level security;
create policy membros_ver on public.membros for select to authenticated
  using (user_id = (select auth.user_id()) or (select public.eh_membro()));
create policy membros_admin_altera on public.membros for update to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));
create policy membros_admin_remove on public.membros for delete to authenticated
  using ((select public.eh_admin()) and user_id <> (select auth.user_id()));

create function public.equipe() returns setof public.membros
  language sql stable security invoker set search_path = ''
as $$ select * from public.membros order by aprovado, criado_em $$;

create function public.atualizar_membro(p_user_id text, p_papel text, p_aprovado boolean) returns public.membros
  language plpgsql security invoker set search_path = ''
as $$
declare v public.membros;
begin
  if not public.eh_admin() then
    raise exception 'Só administradores alteram a equipe' using errcode = '42501';
  end if;
  update public.membros set papel = coalesce(p_papel, papel), aprovado = coalesce(p_aprovado, aprovado)
    where user_id = p_user_id returning * into v;
  if v.user_id is null then raise exception 'Membro não encontrado' using errcode = 'P0002'; end if;
  return v;
end $$;

create function public.remover_membro(p_user_id text) returns void
  language plpgsql security invoker set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Só administradores alteram a equipe' using errcode = '42501';
  end if;
  if p_user_id = auth.user_id() then
    raise exception 'Você não pode remover a própria conta' using errcode = '42501';
  end if;
  delete from public.membros where user_id = p_user_id;
end $$;

-- ---------- relatórios ----------

create table public.relatorios (
  id uuid primary key,
  dados jsonb not null,
  numero text generated always as (dados->>'numero') stored,
  cliente text generated always as (dados->'ident'->>'cliente') stored,
  atualizado_em timestamptz not null,
  excluido boolean not null default false,
  criado_por text not null default auth.user_id(),
  atualizado_por text not null default auth.user_id(),
  criado_em timestamptz not null default now(),
  sincronizado_em timestamptz not null default clock_timestamp()
);
comment on column public.relatorios.atualizado_em is 'Hora da última edição no aparelho (decide qual versão vale).';
comment on column public.relatorios.sincronizado_em is 'Hora em que o servidor gravou; os aparelhos buscam mudanças a partir dela.';
create index relatorios_sincronizado_em on public.relatorios (sincronizado_em);

create function public.relatorios_carimbo() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.sincronizado_em := clock_timestamp();
  new.atualizado_por := coalesce(auth.user_id(), new.atualizado_por);
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  return new;
end $$;

create trigger relatorios_carimbo before insert or update on public.relatorios
  for each row execute function public.relatorios_carimbo();

alter table public.relatorios enable row level security;
create policy relatorios_ver on public.relatorios for select to authenticated using ((select public.eh_membro()));
create policy relatorios_criar on public.relatorios for insert to authenticated with check ((select public.eh_membro()));
create policy relatorios_alterar on public.relatorios for update to authenticated
  using ((select public.eh_membro())) with check ((select public.eh_membro()));

-- Grava a versão do aparelho se for a mais recente; senão devolve a do servidor.
-- Relatório excluído não volta.
create function public.salvar_relatorio(p_id uuid, p_dados jsonb, p_atualizado_em timestamptz, p_excluido boolean default false)
  returns public.relatorios
  language plpgsql security invoker set search_path = ''
as $$
declare
  v public.relatorios;
begin
  if not public.eh_membro() then
    raise exception 'Acesso não aprovado' using errcode = '42501';
  end if;
  insert into public.relatorios as r (id, dados, atualizado_em, excluido)
    values (p_id, p_dados, p_atualizado_em, coalesce(p_excluido, false))
  on conflict (id) do update
    set dados = excluded.dados, atualizado_em = excluded.atualizado_em, excluido = excluded.excluido
    where r.atualizado_em <= excluded.atualizado_em and not r.excluido
  returning * into v;
  if v.id is null then
    select * into v from public.relatorios where id = p_id;
  end if;
  return v;
end $$;

create function public.relatorios_desde(p_desde timestamptz default '-infinity')
  returns setof public.relatorios
  language sql stable security invoker set search_path = ''
as $$ select * from public.relatorios where sincronizado_em > p_desde order by sincronizado_em limit 500 $$;

-- ---------- "Meus dados" de cada pessoa ----------

create table public.perfis (
  user_id text primary key default auth.user_id(),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.perfis enable row level security;
create policy perfis_proprio on public.perfis for all to authenticated
  using (user_id = (select auth.user_id())) with check (user_id = (select auth.user_id()));

create function public.meu_perfil() returns jsonb
  language sql stable security invoker set search_path = ''
as $$ select coalesce((select dados from public.perfis where user_id = auth.user_id()), '{}'::jsonb) $$;

create function public.salvar_perfil(p_dados jsonb) returns void
  language sql security invoker set search_path = ''
as $$
  insert into public.perfis (user_id, dados, atualizado_em) values (auth.user_id(), p_dados, now())
  on conflict (user_id) do update set dados = excluded.dados, atualizado_em = now()
$$;

-- ---------- permissões ----------

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anonymous, public;
revoke execute on all functions in schema public from public, anonymous;
grant select, update (papel, aprovado), delete on public.membros to authenticated;
grant select, insert, update on public.relatorios to authenticated;
grant select, insert, update on public.perfis to authenticated;
grant execute on function
  public.eh_membro(), public.eh_admin(), public.entrar(), public.equipe(),
  public.atualizar_membro(text, text, boolean), public.remover_membro(text),
  public.salvar_relatorio(uuid, jsonb, timestamptz, boolean), public.relatorios_desde(timestamptz),
  public.meu_perfil(), public.salvar_perfil(jsonb)
  to authenticated;
