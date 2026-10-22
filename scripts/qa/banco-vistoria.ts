// Vistoria do aparelho SEMINOVO na venda: obrigatória para seminovo, ausente no lacrado, gravada no
// banco ligada ao IMEI e marcada com X no Termo de Garantia de seminovo. Venda mista, upgrade e
// consulta posterior (admin e técnico, em outros aparelhos).
// Uso: sh scripts/qa/rodar.sh banco-vistoria
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { getAvailableDocuments, getSaleContext, SALE_DOCUMENTS } from '../../src/lib/pdf/saleDocuments';
import { INSPECTION_ITEMS, InspectionDraft } from '../../src/lib/deviceInspection';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { vistoriaCompleta } from './vistoria';
import { Device, DeviceType, Sale } from '../../src/types';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ce = console.error; const errors: string[] = []; console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
const errs = () => [...new Set(errors)].slice(-3).join(' | ');
const STARTED_AT = new Date().toISOString();
const TAG = 'QA' + String(Date.now()).slice(-6);

let T = '';
const enter = async (email: string) => {
  await wait(1500);
  if (T) { localStorage.removeItem(`controlphone_state_v1_real_${T}`); localStorage.removeItem(`controlphone_numbers_v1_${T}`); }
  await supabase.auth.signOut({ scope: 'local' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const r = await loadRealIdentity(data.user!.id);
  if (!r.ok) throw new Error(r.error);
  store.enterRealMode(r.identity);
  const me = store.profiles.find(p => p.id === data.user!.id)!;
  T = me.tenant_id!;
  const ok = await syncTenantRecords(T, me.role);
  return { me, ok };
};
const flush = async () => { await wait(200); return store.pushUnsynced(); };
const attempt = <R,>(fn: () => R): { ok: true; v: R } | { ok: false; e: string } => {
  try { return { ok: true, v: fn() }; } catch (e) { return { ok: false, e: (e as Error).message }; }
};
const now = new Date().toISOString();
const created: string[] = [];
const addDevice = (n: number, type?: DeviceType) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '5' + String(Date.now()).slice(-13) + n, brand: 'Apple', model: `${TAG} iPhone ${type || 'sem tipo'} ${n}`, storage_capacity: '128GB', color: 'Azul', device_type: type, origin: 'purchase', acquisition_cost: 2000, accumulated_repair_cost: 0, suggested_price: 3000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  created.push(dev.id);
  return dev;
};
const sell = (sellerId: string, customerId: string, devices: { id: string; inspection?: InspectionDraft }[]) =>
  store.finalizeSale({ tenantId: T, sellerId, customerId, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
    items: devices.map(d => ({ itemType: 'device' as const, deviceId: d.id, quantity: 1, unitCost: 0, unitPrice: 3000, discount: 0, totalPrice: 0, inspection: d.inspection })),
    payments: [{ paymentMethod: 'pix', amount: 3000 * devices.length, installments: 1 }], gifts: [] });

// Texto do Termo de Garantia com a posição de cada trecho: o X é atribuído à coluna pela posição horizontal
const termCells = (sale: Sale) => {
  const ctx = getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
  const raw = Buffer.from(SALE_DOCUMENTS.find(d => d.id === 'warranty-term')!.build(ctx).doc.output('arraybuffer')).toString('latin1');
  return [...raw.matchAll(/(-?[\d.]+) (-?[\d.]+) Td\s*\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), text: m[3].replace(/\\([()\\])/g, '$1') })); // o PDF escapa parênteses
};
// Linha da tabela de vistoria: "SIM", "NÃO" ou "" conforme a coluna do X na mesma altura da descrição
const markOf = (cells: ReturnType<typeof termCells>, label: string) => {
  const row = cells.find(c => c.text === label);
  if (!row) return 'linha ausente';
  const x = cells.find(c => c.text === 'X' && Math.abs(c.y - row.y) < 2);
  if (!x) return '';
  const sim = cells.find(c => c.text === 'SIM'), nao = cells.find(c => c.text.startsWith('N') && c.text.endsWith('O') && c.text.length === 3);
  if (!sim || !nao) return '?';
  return Math.abs(x.x - sim.x) < Math.abs(x.x - nao.x) ? 'SIM' : 'NÃO';
};

// ---- preparação (admin)
let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const semi1 = addDevice(1, 'seminovo'), lac1 = addDevice(2, 'lacrado'), semi2 = addDevice(3, 'seminovo'), lac2 = addDevice(4, 'lacrado');
const semi3 = addDevice(5, 'seminovo'), old1 = addDevice(6);
store.saveToStorage();
check('aparelhos de teste cadastrados (seminovos, lacrados e um sem tipo)', ok && await flush() && !store.hasUnsynced, errs());

// ---- TESTE 1: venda de seminovo
({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
let r = attempt(() => sell(SELLER_ID, cust.id, [{ id: semi1.id }]));
check('T1: seminovo sem vistoria: venda recusada', !r.ok && r.e.includes('Preencha a vistoria'), r.ok ? 'vendeu' : r.e);
const partial: InspectionDraft = { answers: { front_camera: true, rear_camera: true }, notes: '' };
r = attempt(() => sell(SELLER_ID, cust.id, [{ id: semi1.id, inspection: partial }]));
check('T1: vistoria incompleta: venda recusada', !r.ok, r.ok ? 'vendeu' : '');
const answers = vistoriaCompleta(`${TAG} pequeno risco na lateral`);
answers.answers.microphone = false;
const saleSemi = sell(SELLER_ID, cust.id, [{ id: semi1.id, inspection: answers }]);
const it1 = saleSemi.items![0];
check('T1: vistoria salva no item, ligada ao IMEI, ao vendedor, com data e observações',
  it1.inspection?.imei === semi1.imei && it1.inspection.inspected_by === SELLER_ID && Boolean(it1.inspection.inspected_at) &&
  it1.inspection.answers.microphone === false && it1.inspection.answers.front_camera === true && it1.inspection.notes === `${TAG} pequeno risco na lateral`);
check('T1: garantia do seminovo leva a vistoria', store.warranties.find(w => w.sale_item_id === it1.id)?.inspection?.answers.microphone === false);

// ---- TESTE 2: venda de lacrado (sem vistoria, mesmo que alguém tente enviar uma)
const saleLac = sell(SELLER_ID, cust.id, [{ id: lac1.id, inspection: vistoriaCompleta() }]);
check('T2: lacrado vende sem vistoria e nenhuma vistoria é gravada', !saleLac.items![0].inspection && !store.warranties.some(w => w.sale_id === saleLac.id));

// ---- TESTE 3: venda mista
r = attempt(() => sell(SELLER_ID, cust.id, [{ id: semi2.id }, { id: lac2.id }]));
check('T3: venda mista sem a vistoria do seminovo: recusada', !r.ok && r.e.includes(semi2.imei), r.ok ? 'vendeu' : r.e);
const saleMix = sell(SELLER_ID, cust.id, [{ id: semi2.id, inspection: vistoriaCompleta() }, { id: lac2.id }]);
const mixSemi = saleMix.items!.find(i => i.device_id === semi2.id)!, mixLac = saleMix.items!.find(i => i.device_id === lac2.id)!;
check('T3: só o seminovo tem vistoria na venda mista', Boolean(mixSemi.inspection) && mixSemi.inspection!.imei === semi2.imei && !mixLac.inspection);

// ---- upgrade: aparelho entregue seminovo exige vistoria
const upgrade = (inspection?: InspectionDraft) => attempt(() => store.processTradeIn({ tenantId: T, customerId: cust.id, sellerId: SELLER_ID, soldDeviceId: semi3.id, soldDevicePrice: 3000,
  receivedImei: '5' + String(Date.now()).slice(-13) + '9', receivedBrand: 'Apple', receivedModel: `${TAG} recebido`, receivedStorage: '64GB', receivedColor: 'Preto',
  appraisalValue: 1000, paymentMethod: 'pix', salesOrigin: 'Instagram', soldDeviceInspection: inspection }));
r = upgrade();
check('upgrade com seminovo sem vistoria: recusado', !r.ok && r.e.includes('Preencha a vistoria'), r.ok ? 'concluiu' : r.e);
const up = upgrade(vistoriaCompleta());
if (up.ok) created.push(up.v.received_device_id);
const upSale = up.ok ? store.sales.find(s => s.id === up.v.sale_id) : undefined;
check('upgrade com a vistoria: concluído e vistoria gravada no aparelho entregue', up.ok && upSale?.items?.[0].inspection?.imei === semi3.imei, up.ok ? '' : up.e);

// venda antiga sem tipo: segue sem vistoria (o termo mantém o quadro em branco de antes)
const saleOld = sell(SELLER_ID, cust.id, [{ id: old1.id }]);
check('aparelho sem tipo vende sem vistoria, como antes', !saleOld.items![0].inspection);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());

// ---- TESTE 4: histórico em outro aparelho (admin) e PDF
({ me, ok } = await enter(ADMIN_EMAIL));
const s1 = store.sales.find(s => s.id === saleSemi.id)!;
check('T4: vistoria continua salva na venda e na garantia depois de recarregar (banco)',
  ok && s1?.items?.[0].inspection?.imei === semi1.imei && s1.items[0].inspection.answers.microphone === false &&
  store.warranties.find(w => w.sale_item_id === s1.items![0].id)?.inspection?.notes === `${TAG} pequeno risco na lateral`, errs());
const cells = termCells(s1);
const rowMarks = INSPECTION_ITEMS.map(({ key, label }) => [key, markOf(cells, label)]);
check('PDF seminovo: X em SIM nas respostas SIM e em NÃO no microfone',
  rowMarks.every(([key, mark]) => mark === (key === 'microphone' ? 'NÃO' : 'SIM')), JSON.stringify(rowMarks));
check('PDF seminovo: sem perguntas sobre trinca e com as observações no OBS',
  !cells.some(c => c.text.includes('Há trinca')) && cells.some(c => c.text.includes(`${TAG} pequeno risco`)));
check('PDF seminovo: demais cláusulas preservadas', ['1)   DA ABRANG', '2)   DAS CONDI', '3)   DAS EXCLUDENTES', '4)   DAS VISTORIA'].every(t => cells.some(c => c.text.startsWith(t))) );
const sLac = store.sales.find(s => s.id === saleLac.id)!;
const lacDocs = getAvailableDocuments(getSaleContext(sLac, store.tenants.find(t => t.id === T)!, store.themes[T])).map(d => d.label);
check('lacrado: sem Termo de Garantia de seminovo nem vistoria; só o documento de lacrado', !lacDocs.includes('Termo de Garantia') && lacDocs.some(l => l.startsWith('Comprovante de Venda — Lacrado')), lacDocs.join(', '));
const sMix = store.sales.find(s => s.id === saleMix.id)!;
const mixCells = termCells(sMix);
check('venda mista: o Termo de Garantia traz só o seminovo, com os X da vistoria',
  mixCells.some(c => c.text.includes(semi2.imei)) && !mixCells.some(c => c.text.includes(lac2.imei)) && INSPECTION_ITEMS.every(({ label }) => markOf(mixCells, label) === 'SIM'));
const oldCells = termCells(store.sales.find(s => s.id === saleOld.id)!);
check('venda sem vistoria mantém o quadro antigo em branco (registros anteriores não mudam)', oldCells.some(c => c.text.includes('Há trinca')) && !oldCells.some(c => c.text === 'X'));

// técnico consulta pela garantia (Assistência Técnica)
({ me, ok } = await enter(TECH_EMAIL));
check('técnico, em outro aparelho, consulta a vistoria pela garantia do IMEI', ok && store.warranties.find(w => w.imei === semi1.imei)?.inspection?.answers.microphone === false, errs());

// ---- limpeza (admin)
({ me, ok } = await enter(ADMIN_EMAIL));
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, garantias, movimentações, aparelhos e cliente de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === created.length && delCust.data?.length === 1, `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}/${created.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
