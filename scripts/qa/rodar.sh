#!/bin/sh
# Empacota um teste de scripts/qa (TypeScript que importa o código do app) e executa no Node.
# Uso: sh scripts/qa/rodar.sh fluxos-locais
#      QA_ADMIN_EMAIL=... QA_SELLER_EMAIL=... QA_TECH_EMAIL=... QA_PASSWORD=... sh scripts/qa/rodar.sh banco-estoque
set -e
cd "$(dirname "$0")/../.."
NAME="$1"
OUT="node_modules/.cache/qa-$NAME.mjs"
mkdir -p node_modules/.cache
printf "export default { input: './scripts/qa/%s.ts', platform: 'node', output: { file: './%s', format: 'esm' }, external: [/^@supabase/, /^@electric-sql/], resolve: { alias: { 'npm:pdf-lib@1.17.1': 'pdf-lib', 'npm:@supabase/supabase-js@2': '%s/scripts/qa/shims/fake-supabase.ts' } } };\n" "$NAME" "$OUT" "$PWD" \
  > node_modules/.cache/qa-rolldown.config.mjs
npx rolldown -c node_modules/.cache/qa-rolldown.config.mjs > /dev/null
# import.meta.env só existe no Vite: troca pelos valores do .env (o arquivo gerado fica fora do Git)
node scripts/qa/aplicar-env.mjs "$OUT"
node "$OUT"
rm -f "$OUT"
