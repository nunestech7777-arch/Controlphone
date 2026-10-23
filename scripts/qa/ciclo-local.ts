// Reset Geral da Loja no aplicativo: a cópia local de um ciclo encerrado é descartada ao entrar
// (nada dela é reenviado ao banco), e a cópia do ciclo ativo é mantida.
// Uso: sh scripts/qa/rodar.sh ciclo-local
import './shim';
import { store, RealIdentity } from '../../src/lib/store';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };
const T = '33333333-3333-3333-3333-333333333333';
const KEY = `controlphone_state_v1_real_${T}`;
const identity = (cycle: RealIdentity['cycle']): RealIdentity => ({ scope: T, tenants: [], themes: {}, profiles: [], tenantSettings: {}, tenantDocuments: [], cycle });
const saved = (cycleId?: string) => JSON.stringify({ cycleId, tenants: [], customers: [{ id: 'c-antigo', tenant_id: T, name: 'Cliente do ciclo antigo', phone: '1', created_at: '2026-01-01' }] });

localStorage.setItem(KEY, saved('ciclo-1'));
store.enterRealMode(identity({ id: 'ciclo-1', number: 1 }));
check('mesmo ciclo: a cópia local é mantida', store.customers.some(c => c.id === 'c-antigo'));
store.saveToStorage();
check('a cópia local passa a guardar o ciclo dela', JSON.parse(localStorage.getItem(KEY)!).cycleId === 'ciclo-1');

localStorage.setItem(KEY, saved('ciclo-1'));
store.enterRealMode(identity({ id: 'ciclo-2', number: 2 }));
check('loja reiniciada (Ciclo 2): a cópia do Ciclo 1 é descartada ao entrar', !store.customers.some(c => c.id === 'c-antigo') && !store.hasUnsynced);

localStorage.setItem(KEY, saved(undefined));
store.enterRealMode(identity({ id: 'ciclo-2', number: 2 }));
check('cópia antiga sem ciclo (de antes deste recurso) numa loja já reiniciada: descartada', !store.customers.some(c => c.id === 'c-antigo'));

localStorage.setItem(KEY, saved(undefined));
store.enterRealMode(identity(null));
check('loja nunca reiniciada (sem ciclo no banco): a cópia local é mantida', store.customers.some(c => c.id === 'c-antigo'));

console.log(`\n${pass} verificações passaram, ${failN} falharam`);
process.exit(failN ? 1 : 0);
