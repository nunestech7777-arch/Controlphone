# Testes de QA

Testes que exercitam o motor de dados do app (`src/lib/store.ts`) fora do navegador.

| Arquivo | O que confere | Precisa do banco |
| --- | --- | --- |
| `fluxos-locais.ts` | Venda, upgrade, cancelamento, devolução e OS (40 verificações) | Não |
| `atacado-local.ts` | Módulo Atacado: estoque, venda, custo médio, financeiro e isolamento do varejo (23 verificações) | Não |
| `migrations-banco-local.ts` | Todas as migrations aplicam do zero; 19 e 20 rodam duas vezes sem perder dados | Não (Postgres embutido) |
| `atacado-banco-local.ts` | Migration 19 no banco: regras de acesso, venda atômica, vendedor, módulo desligado (26 verificações) | Não (Postgres embutido) |
| `backup-banco-local.ts` | Migration 20 + arquivo `.controlphone`: criar, baixar, restaurar, isolamento entre lojas, arquivo adulterado, automático e retenção (63 verificações) | Não (Postgres embutido) |
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

## Testes com Postgres embutido

Os testes `*-banco-local` sobem um Postgres dentro do Node (PGlite, em `banco-local.ts`), aplicam
todas as migrations de `supabase/migrations` e chamam as funções como super admin, administrador,
vendedor e técnico. Não usam internet nem o Supabase de verdade, então podem rodar à vontade:

```sh
sh scripts/qa/rodar.sh backup-banco-local
```

O que eles não cobrem: o agendamento (`pg_cron`), os limites de tempo do Supabase e o Storage.
