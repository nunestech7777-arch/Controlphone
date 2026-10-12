# Testes de QA

Testes que exercitam o motor de dados do app (`src/lib/store.ts`) fora do navegador.

| Arquivo | O que confere | Precisa do banco |
| --- | --- | --- |
| `fluxos-locais.ts` | Venda, upgrade, cancelamento, devolução e OS (40 verificações) | Não |
| `banco-clientes-fornecedores.ts` | Gravação e leitura de clientes e fornecedores com admin, vendedor e técnico | Sim |
| `banco-estoque.ts` | Estoque no banco: venda, cancelamento, upgrade e manutenção em aparelhos diferentes | Sim |
| `banco-regras-de-acesso.mjs` | Regras de acesso (RLS) de clientes e fornecedores | Sim |
| `banco-operacional.ts` | Vendas, cancelamento, upgrade, devolução com crédito, OS, regras de acesso por perfil, numeração por loja e envio único dos registros antigos (tabela `tenant_records`) | Sim |
| `desempenho-fila.ts` | Tempo de uma gravação com muito histórico (5.000 vendas, 20.000 movimentações) | Não |

## Rodar

```sh
sh scripts/qa/rodar.sh fluxos-locais
```

Os testes de banco usam a loja de teste e leem as contas do ambiente:

```sh
export QA_ADMIN_EMAIL=... QA_SELLER_EMAIL=... QA_TECH_EMAIL=... QA_PASSWORD=...
sh scripts/qa/rodar.sh banco-clientes-fornecedores
sh scripts/qa/rodar.sh banco-estoque
sh scripts/qa/rodar.sh banco-operacional
node scripts/qa/banco-regras-de-acesso.mjs "$QA_SELLER_EMAIL"
```

Use somente contas de uma loja de teste. Os testes criam registros com nome começando em `QA` e apagam ao final.
Se um teste for interrompido no meio, apague esses registros manualmente.

O histórico de atividades não pode ser apagado pelo aplicativo (nem pelo administrador). O `banco-operacional`
imprime, no final, o comando para apagar no SQL Editor os registros de histórico que ele gerou.
