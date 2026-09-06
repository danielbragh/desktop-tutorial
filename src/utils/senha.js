const REGRA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

function senhaForte(senha) {
  return typeof senha === 'string' && REGRA.test(senha);
}

const MENSAGEM_REGRA =
  'A senha deve ter no mínimo 10 caracteres, com letra maiúscula, minúscula e número.';

module.exports = { senhaForte, MENSAGEM_REGRA };
