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
| `banco-tipo-aparelho.ts` | Seminovo x lacrado: tipo no banco, comprovante escolhido automaticamente (com os avisos do lacrado), venda mista, preservação do documento, textos da loja, permissões e isolamento | Sim |
| `banco-exclusao-aparelho.ts` | Exclusão e inativação de aparelhos: estoque e compra do fornecedor corrigidos na mesma transação, bloqueios por vínculo, falha sem alteração parcial, permissões e histórico | Sim |
| `banco-origens.ts` | Origem do cliente e da venda (orgânico x anúncio pago): gravação no banco e relatório separado por origem | Sim |
| `banco-editar-acessorio.ts` | Edição de acessório e brinde (quantidade, custo, preço e fornecedor) e correção da compra no fornecedor | Sim |
| `banco-vistoria.ts` | Vistoria do seminovo na venda: obrigatória no seminovo, ausente no lacrado, gravada com o IMEI e marcada com X no Termo de Garantia | Sim |
| `banco-cadastro-lote.ts` | Cadastro em lote: um registro por IMEI, custo individual, tudo ou nada, IMEI repetido, reenvio sem duplicar, colar IMEIs, venda de 1 unidade, sem grade (**exige a migration 25**) | Sim |
| `reset-banco-local.ts` | Reset Geral da Loja num Postgres local com todas as migrations: permissões, pagamento pendente/recusado/confirmado, falha no arquivamento, reset com e sem arquivamento, comprovantes preservados, isolamento entre lojas, aparelho com cópia antiga e pedido repetido | Não |
| `documentos-preservados.ts` | PDFs (comprovante, garantia Apple, Termo de Garantia) gerados a partir da cópia preservada no reset, com o estoque já zerado | Não |
| `ciclo-local.ts` | O aplicativo descarta a cópia local de um ciclo encerrado ao entrar | Não |
| `banco-garantia-apple.ts` | Termo de Garantia Apple (1 ano) do lacrado: registro na venda (versão e ciência), dois PDFs separados (comprovante sem o termo; termo com o texto integral conferido parágrafo a parágrafo), botões Baixar Comprovante/Baixar Garantia, venda antiga recuperável, seminovo e outras marcas sem o termo | Sim |
| `banco-lixeira.ts` | Lixeira de vendas canceladas: mover, restaurar (continua cancelada), excluir definitivamente, sem mexer em estoque/financeiro/metas, auditoria e proteção no banco (**exige a migration 26**) | Sim |
| `banco-exclusao-venda.ts` | Excluir Venda (exclusão lógica): indicadores, estoque por situação do aparelho, estorno, garantia, auditoria e proteção no banco (**exige a migration 24**) | Sim |
| `banco-juros.ts` | Juros da maquininha no crédito: faturamento com juros, lucro sem juros, pagamento misto, comprovante, cancelamento e devolução | Sim |
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
sh scripts/qa/rodar.sh banco-tipo-aparelho
sh scripts/qa/rodar.sh banco-exclusao-aparelho
sh scripts/qa/rodar.sh banco-origens
sh scripts/qa/rodar.sh banco-editar-acessorio
sh scripts/qa/rodar.sh banco-vistoria
sh scripts/qa/rodar.sh banco-juros
sh scripts/qa/rodar.sh banco-exclusao-venda
sh scripts/qa/rodar.sh banco-cadastro-lote
sh scripts/qa/rodar.sh banco-lixeira
sh scripts/qa/rodar.sh banco-garantia-apple
sh scripts/qa/rodar.sh reset-banco-local
sh scripts/qa/rodar.sh documentos-preservados
sh scripts/qa/rodar.sh ciclo-local
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
