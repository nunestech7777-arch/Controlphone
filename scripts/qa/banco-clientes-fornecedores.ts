import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store, isUuid } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${extra ? ' — ' + extra : ''}`); };
const enter = async (email: string) => {
  await supabase.auth.signOut({ scope: 'local' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const r = await loadRealIdentity(data.user!.id);
  if (!r.ok) throw new Error(r.error);
  store.enterRealMode(r.identity);
  return store.profiles.find(p => p.id === data.user!.id)!;
};
const TAG = 'QA-' + Date.now();
const STARTED_AT = new Date().toISOString();
const created: string[] = [], createdSup: string[] = [];

// ---- APARELHO A: administrador, com cadastros antigos (anteriores à ligação com o banco)
let me = await enter(ADMIN_EMAIL);
const T = me.tenant_id!;
const now = new Date().toISOString();
store.customers.unshift({ id: 'cust-antigo-1', tenant_id: T, name: `${TAG} Cliente Antigo`, phone: '(11) 91111-1111', birth_date: '', created_at: now } as any);
store.suppliers.unshift({ id: 'sup-antigo-1', tenant_id: T, name: `${TAG} Fornecedor Antigo`, phone: '(11) 3111-1111', created_at: now });
store.devices.unshift({ id: 'dev-qa', tenant_id: T, imei: '9' + String(Date.now()).slice(-14), brand: 'Apple', model: 'QA', storage_capacity: '64GB', color: 'X', supplier_id: 'sup-antigo-1', origin: 'purchase', acquisition_cost: 1, accumulated_repair_cost: 0, suggested_price: 2, status: 'available', entry_date: now, created_at: now });
store.serviceOrders.unshift({ id: 'os-qa', tenant_id: T, os_number: 9999, origin: 'external', customer_id: 'cust-antigo-1', intake_seller_id: me.id, device_brand: 'Apple', device_model: 'QA', reported_defect: 'x', status: 'cancelled', closed_at: now, technician_parts_cost: 0, technician_service_cost: 0, created_at: now });
store.saveToStorage();

let ok = await syncTenantRecords(T, 'admin');
const oldC = store.customers.find(c => c.name === `${TAG} Cliente Antigo`)!;
const oldS = store.suppliers.find(s => s.name === `${TAG} Fornecedor Antigo`)!;
created.push(oldC.id); createdSup.push(oldS.id);
check('sincronização do admin concluída', ok);
check('cliente antigo ganhou identificador do banco e a OS continua apontando para ele', isUuid(oldC.id) && store.serviceOrders.find(o => o.id === 'os-qa')!.customer_id === oldC.id);
check('fornecedor antigo ganhou identificador do banco e o aparelho continua vinculado', isUuid(oldS.id) && store.devices.find(d => d.model === 'QA')!.supplier_id === oldS.id);
let db = await supabase.from('customers').select('name').eq('id', oldC.id).maybeSingle();
check('cliente antigo está gravado no banco', db.data?.name === oldC.name, db.error?.message);
db = await supabase.from('suppliers').select('name').eq('id', oldS.id).maybeSingle();
check('fornecedor antigo está gravado no banco', db.data?.name === oldS.name, db.error?.message);
check('fila de envio vazia depois da sincronização', !store.hasUnsynced);

// cadastro e edição pela tela
let saved = store.saveCustomer({ tenantId: T, userId: me.id, data: { name: `${TAG} Cliente Novo`, phone: '(11) 92222-2222', cpf: '529.982.247-25', birth_date: '1990-10-12' } });
created.push(saved.data!.id);
await store.pushUnsynced();
db = await supabase.from('customers').select('name, cpf, birth_date, whatsapp').eq('id', saved.data!.id).maybeSingle();
check('cliente novo gravado no banco com CPF, nascimento e WhatsApp', db.data?.cpf === '529.982.247-25' && db.data?.birth_date === '1990-10-12' && db.data?.whatsapp === '(11) 92222-2222', db.error?.message);
store.saveCustomer({ tenantId: T, userId: me.id, customerId: saved.data!.id, data: { name: `${TAG} Cliente Novo (editado)`, phone: '(11) 92222-2222', email: 'qa@teste.com' } });
await store.pushUnsynced();
db = await supabase.from('customers').select('name, email, cpf').eq('id', saved.data!.id).maybeSingle();
check('edição do cliente chegou ao banco (e campo apagado ficou vazio)', db.data?.name.endsWith('(editado)') && db.data?.email === 'qa@teste.com' && db.data?.cpf === null);
const sup = store.saveSupplier({ tenantId: T, userId: me.id, data: { name: `${TAG} Fornecedor Novo`, phone: '(11) 3222-2222', company_name: 'QA LTDA' } });
createdSup.push(sup.data!.id);
await store.pushUnsynced();

// ---- APARELHO B: mesmo admin em outro navegador (armazenamento local vazio)
const authKey = Object.keys((globalThis as any).__mem || {});
void authKey;
await new Promise(r => setTimeout(r, 2000)); // espera os envios em segundo plano terminarem
localStorage.removeItem(`controlphone_state_v1_real_${T}`);
me = await enter(ADMIN_EMAIL);
check('outro aparelho começa sem clientes locais', store.customers.filter(c => c.tenant_id === T && c.name.startsWith(TAG)).length === 0);
ok = await syncTenantRecords(T, 'admin');
const names = store.customers.filter(c => c.name.startsWith(TAG)).map(c => c.name);
check('outro aparelho recebe os clientes do banco, com a edição', ok && names.length === 2 && names.some(n => n.endsWith('(editado)')), names.join(' | '));
check('outro aparelho recebe os fornecedores', store.suppliers.filter(s => s.name.startsWith(TAG)).length === 2);
const loaded = store.customers.find(c => c.id === saved.data!.id)!;
check('campos vazios voltam como ausentes, não como null', loaded.cpf === undefined && loaded.birth_date === undefined && loaded.email === 'qa@teste.com' && !('updated_at' in loaded));

// ---- VENDEDOR em outro aparelho
localStorage.removeItem(`controlphone_state_v1_real_${T}`);
me = await enter(SELLER_EMAIL);
ok = await syncTenantRecords(T, me.role);
check('vendedor enxerga os clientes da loja', ok && store.customers.filter(c => c.name.startsWith(TAG)).length === 2);
check('vendedor não recebe fornecedores', store.suppliers.filter(s => s.name.startsWith(TAG)).length === 0);
const bySeller = store.saveCustomer({ tenantId: T, userId: me.id, data: { name: `${TAG} Cliente do Vendedor`, phone: '(11) 93333-3333' }, origin: 'cadastro rápido na venda' });
created.push(bySeller.data!.id);
const pushed = await store.pushUnsynced();
db = await supabase.from('customers').select('name').eq('id', bySeller.data!.id).maybeSingle();
check('cliente cadastrado pelo vendedor chega ao banco', pushed && Boolean(db.data));
const refused = store.saveSupplier({ tenantId: T, userId: me.id, data: { name: 'x', phone: '1' } });
check('vendedor não cadastra fornecedor', !refused.ok, refused.error);

// ---- TÉCNICO: só consulta
localStorage.removeItem(`controlphone_state_v1_real_${T}`);
me = await enter(TECH_EMAIL);
ok = await syncTenantRecords(T, me.role);
check('técnico enxerga os clientes (inclusive o do vendedor)', ok && store.customers.filter(c => c.name.startsWith(TAG)).length === 3);

// ---- ADMIN: exclusão de fornecedor e limpeza
localStorage.removeItem(`controlphone_state_v1_real_${T}`);
me = await enter(ADMIN_EMAIL);
await syncTenantRecords(T, 'admin');
store.deleteSupplier(sup.data!.id);
await new Promise(r => setTimeout(r, 1500));
db = await supabase.from('suppliers').select('id').eq('id', sup.data!.id).maybeSingle();
check('fornecedor excluído na tela some do banco', !db.data);
const delC = await supabase.from('customers').delete().in('id', created).select('id');
await supabase.from('devices').delete().eq('tenant_id', T).eq('model', 'QA');
const delS = await supabase.from('suppliers').delete().in('id', createdSup).select('id');
// documentos que o teste gerou de passagem (a OS antiga, por exemplo) também saem do banco
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, 'os-qa', TAG]);
check('limpeza dos registros de teste', delC.data?.length === created.length && docs.deleted === docs.found, `clientes removidos: ${delC.data?.length}, fornecedores: ${delS.data?.length}, documentos: ${docs.deleted}/${docs.found}`);
const left = await supabase.from('customers').select('id', { count: 'exact', head: true }).like('name', 'QA-%');
console.log(`\n${pass} verificações passaram, ${failN} falharam | registros de teste restantes no banco: ${left.count}`);
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
