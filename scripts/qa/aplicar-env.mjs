// Substitui import.meta.env.* (que só existe no Vite) pelos valores do .env no arquivo empacotado.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(new URL('../../.env', import.meta.url), 'utf8')
      .split('\n')
      .filter(line => line.includes('=') && !line.startsWith('#'))
      .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
  );
} catch {
  // sem .env os testes locais rodam mesmo assim
}

let source = readFileSync(file, 'utf8');
for (const [key, value] of Object.entries(env)) {
  source = source.split('import.meta.env.' + key).join(JSON.stringify(value));
}
source = source.split('import.meta.env').join('({})');
writeFileSync(file, source);
