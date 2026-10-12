// Mede o custo de uma gravação (saveToStorage) com muito histórico na loja, no modo real.
// Não usa o banco: encerra antes de qualquer envio. Uso: sh scripts/qa/rodar.sh desempenho-fila
import './shim';
import { store } from '../../src/lib/store';

const T = '00000000-0000-4000-8000-000000000001';
const U = '00000000-0000-4000-8000-000000000002';
const now = new Date().toISOString();
const N = { sales: 5000, serviceOrders: 2000, deviceMovements: 20000, auditLogs: 20000 };
const sales = Array.from({ length: N.sales }, (_, i) => ({
  id: `sale-${i}`, tenant_id: T, sale_number: 1001 + i, seller_id: U, customer_id: 'c', sales_origin: 'Outro', subtotal: 3050, discount_amount: 0,
  total_amount: 3050, total_cost: 2010, gross_profit: 1040, status: 'completed', created_at: now,
  items: [0, 1].map(n => ({ id: `sitem-${i}-${n}`, sale_id: `sale-${i}`, item_type: n ? 'accessory' : 'device', device_id: 'd', quantity: 1, unit_cost: 2000, unit_price: 3000, discount: 0, total_price: 3000 })),
  payments: [{ id: `spay-${i}`, sale_id: `sale-${i}`, payment_method: 'pix', amount: 3050, installments: 1, received_at: now }], gifts: []
}));
const warranties = sales.map((s, i) => ({ id: `war-${i}`, tenant_id: T, sale_id: s.id, sale_item_id: `sitem-${i}-0`, device_id: 'd', imei: '1', customer_id: 'c', sale_date: now, warranty_days: 90, start_date: '2026-01-01', end_date: '2026-04-01', terms: 'x'.repeat(250), status: 'active', history: [{ at: now, description: 'Garantia registrada' }], created_at: now }));
const serviceOrders = Array.from({ length: N.serviceOrders }, (_, i) => ({ id: `os-${i}`, tenant_id: T, os_number: 501 + i, origin: 'external', intake_seller_id: U, device_brand: 'Apple', device_model: 'iPhone', reported_defect: 'Não carrega', status: 'delivered', technician_parts_cost: 100, technician_service_cost: 50, closed_at: now, entered_at: now, payment_status: 'paid', created_at: now }));
const deviceMovements = Array.from({ length: N.deviceMovements }, (_, i) => ({ id: `mov-${i}`, tenant_id: T, device_id: 'd', imei: '1', movement_type: 'sold', description: 'Aparelho vendido na venda #1001', from_status: 'available', to_status: 'sold', user_id: U, user_name: 'Teste', created_at: now }));
const auditLogs = Array.from({ length: N.auditLogs }, (_, i) => ({ id: `log-${i}`, tenant_id: T, user_id: U, user_role: 'admin', action: 'VENDA_FINALIZADA', module: 'Vendas', record_id: `sale-${i}`, details: { numero: 1001 + i, origem: 'Outro', total: 3050, itens_qtd: 2 }, created_at: now }));

localStorage.setItem(`controlphone_state_v1_real_${T}`, JSON.stringify({ sales, warranties, serviceOrders, deviceMovements, auditLogs, legacyPending: {}, syncCursors: {} }));
store.enterRealMode({ scope: T, tenants: [], themes: {}, profiles: [], tenantSettings: {}, tenantDocuments: [] });
store.syncRole = 'admin';
store.syncUserId = U;

const time = (fn: () => void) => { const t = performance.now(); fn(); return performance.now() - t; };
const internals = store as unknown as { trackChanges(): void; snapshot(): unknown };
const track = Array.from({ length: 5 }, () => time(() => internals.trackChanges()));
const serialize = Array.from({ length: 5 }, () => time(() => JSON.stringify(internals.snapshot())));
const bytes = JSON.stringify(internals.snapshot()).length;
const mid = (list: number[]) => [...list].sort((a, b) => a - b)[2].toFixed(1);
console.log(`registros: ${N.sales} vendas, ${N.sales} garantias, ${N.serviceOrders} OS, ${N.deviceMovements} movimentações, ${N.auditLogs} registros de histórico`);
console.log(`cache: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`conferir o que mudou (trackChanges): ${mid(track)} ms`);
console.log(`montar o cache para gravar (JSON do estado inteiro): ${mid(serialize)} ms`);
console.log(`fila de envio depois da conferência: ${Object.values(store.unsynced).reduce((n, l) => n + l.length, 0)} registros (esperado 0)`);
process.exit(0);
