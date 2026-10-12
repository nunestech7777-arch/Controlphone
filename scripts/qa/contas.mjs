// Contas da loja de teste, lidas do ambiente (nunca escreva e-mail ou senha neste arquivo).
const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Defina a variável ${name} antes de rodar (veja scripts/qa/README.md).`);
  return value;
};

export const ADMIN_EMAIL = need('QA_ADMIN_EMAIL');
export const SELLER_EMAIL = need('QA_SELLER_EMAIL');
export const TECH_EMAIL = need('QA_TECH_EMAIL');
export const PASSWORD = need('QA_PASSWORD');
