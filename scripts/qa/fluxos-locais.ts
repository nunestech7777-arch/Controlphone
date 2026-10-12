import { quota } from './shim';
import { store } from '../../src/lib/store';

const T = 'tenant-itech-01';
const ADMIN = 'user-admin-01', SELLER = 'user-seller-01', TECH = 'user-tech-01';
let pass = 0, failN = 0;
const check = (id: string, desc: string, ok: boolean, extra = '') => {
  ok ? pass++ : failN++;
  console.log(`${ok ? 'OK  ' : 'FALHOU'} [${id}] ${desc}${extra ? ' — ' + extra : ''}`);
};
const attempt = <R,>(fn: () => R): { ok: true; v: R } | { ok: false; e: string } => {
  try { return { ok: true, v: fn() }; } catch (e: any) { return { ok: false, e: e.message }; }
};
const ce = console.error; console.error = () => {};
const dev = (id: string) => store.devices.find(d => d.id === id)!;
const addDev = (id: string, imei: string, cost = 2000, price = 3000) => store.devices.push({ id, tenant_id: T, imei, brand: 'Apple', model: 'iPhone 13', storage_capacity: '128GB', color: 'Azul', origin: 'purchase', acquisition_cost: cost, accumulated_repair_cost: 0, suggested_price: price, status: 'available', entry_date: new Date().toISOString(), created_at: new Date().toISOString() });
const base = { tenantId: T, sellerId: SELLER, customerId: 'cust-01', salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0 };
const devItem = (deviceId: string, price: number, discount = 0) => ({ itemType: 'device' as const, deviceId, quantity: 1, unitCost: 0, unitPrice: price, discount, totalPrice: 0 });
const sell = (deviceId: string, price: number, customerId = 'cust-01') =>
  store.finalizeSale({ ...base, customerId, items: [devItem(deviceId, price)], payments: [{ paymentMethod: 'pix', amount: price, installments: 1 }], gifts: [] });

// ---- VENDA
let r: any = attempt(() => store.finalizeSale({ ...base, items: [{ itemType: 'accessory', accessoryId: 'acc-04', quantity: 100, unitCost: 0, unitPrice: 99, discount: 0, totalPrice: 0 }], payments: [{ paymentMethod: 'cash', amount: 9900, installments: 1 }], gifts: [] }));
check('B2', 'acessório acima do estoque é recusado', !r.ok && store.accessories.find(a => a.id === 'acc-04')!.quantity === 38, r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [{ itemType: 'accessory', accessoryId: 'acc-04', quantity: 20, unitCost: 0, unitPrice: 99, discount: 0, totalPrice: 0 }, { itemType: 'accessory', accessoryId: 'acc-04', quantity: 20, unitCost: 0, unitPrice: 99, discount: 0, totalPrice: 0 }], payments: [{ paymentMethod: 'cash', amount: 3960, installments: 1 }], gifts: [] }));
check('B2', 'linhas repetidas do mesmo acessório somam para conferir o estoque', !r.ok, r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [{ itemType: 'accessory', accessoryId: 'acc-04', quantity: 2, unitCost: 0, unitPrice: 99, discount: 0, totalPrice: 0 }], payments: [{ paymentMethod: 'cash', amount: 198, installments: 1 }], gifts: [{ giftId: 'gift-01', quantity: 500, unitCost: 0 }] }));
check('B2', 'brinde acima do estoque é recusado', !r.ok && store.gifts.find(g => g.id === 'gift-01')!.quantity === 50, r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [devItem('dev-01', -50)], payments: [{ paymentMethod: 'pix', amount: 1, installments: 1 }], gifts: [] }));
check('B3', 'preço negativo é recusado', !r.ok, r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [devItem('dev-01', 6890, 9999)], payments: [{ paymentMethod: 'pix', amount: 1, installments: 1 }], gifts: [] }));
check('B3', 'desconto maior que o preço é recusado', !r.ok, r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [devItem('dev-01', 6890)], payments: [{ paymentMethod: 'pix', amount: 1, installments: 1 }], gifts: [] }));
check('B3', 'pagamentos que não fecham o total são recusados', !r.ok && dev('dev-01').status === 'available', r.e);
r = attempt(() => store.finalizeSale({ ...base, customerId: 'nao-existe', items: [devItem('dev-01', 6890)], payments: [{ paymentMethod: 'pix', amount: 6890, installments: 1 }], gifts: [] }));
check('B3', 'cliente inexistente é recusado', !r.ok, r.e);
r = attempt(() => store.finalizeSale({ ...base, tenantId: 'tenant-barra-02', items: [devItem('dev-01', 6890)], payments: [{ paymentMethod: 'pix', amount: 6890, installments: 1 }], gifts: [] }));
check('B3', 'vendedor de outra loja é recusado', !r.ok, r.e);
// venda válida com pagamento dividido, desconto, acessório x3 e brinde; custo enviado pela tela (0) é ignorado
r = attempt(() => store.finalizeSale({ ...base,
  items: [devItem('dev-01', 6890, 190), { itemType: 'accessory', accessoryId: 'acc-04', quantity: 3, unitCost: 0, unitPrice: 99, discount: 9, totalPrice: 0 }],
  payments: [{ paymentMethod: 'pix', amount: 3000, installments: 1 }, { paymentMethod: 'credit_card', amount: 3000, installments: 10 }, { paymentMethod: 'cash', amount: 970, installments: 1 }],
  gifts: [{ giftId: 'gift-01', quantity: 2, unitCost: 0 }] }));
check('V1', 'venda com 3 formas de pagamento, desconto, 3 acessórios e 2 brindes', r.ok && r.v.total_amount === 6970 && r.v.total_cost === 5400 + 75 + 48 && r.v.gross_profit === 6970 - 5523 && r.v.payments.length === 3,
  r.ok ? `total=${r.v.total_amount} custo=${r.v.total_cost} lucro=${r.v.gross_profit}` : r.e);
check('V1', 'estoque baixado corretamente', dev('dev-01').status === 'sold' && store.accessories.find(a => a.id === 'acc-04')!.quantity === 35 && store.gifts.find(g => g.id === 'gift-01')!.quantity === 48);
const saleV1 = r.v;
check('V1', 'garantia de 90 dias criada', store.warranties.some(w => w.sale_id === saleV1.id && w.status === 'active' && w.warranty_days === 90));
let c: any = store.cancelSale(saleV1.id, T, SELLER, 'teste');
check('S2', 'vendedor não consegue cancelar venda', !c.ok, c.error);
c = store.cancelSale(saleV1.id, T, ADMIN, 'cliente desistiu');
check('V2', 'cancelamento pelo admin devolve estoque, brindes e cancela a garantia', c.ok && dev('dev-01').status === 'available' && store.accessories.find(a => a.id === 'acc-04')!.quantity === 38 && store.gifts.find(g => g.id === 'gift-01')!.quantity === 50 && !store.warranties.some(w => w.sale_id === saleV1.id && w.status === 'active') && store.auditLogs[0].user_role === 'admin');

// ---- UPGRADE
const up = (imei: string, price: number, appraisal: number, soldId = 'dev-02', customerId = 'cust-02', method: any = 'pix', installments = 1) =>
  attempt(() => store.processTradeIn({ tenantId: T, customerId, sellerId: SELLER, soldDeviceId: soldId, soldDevicePrice: price, receivedImei: imei, receivedBrand: 'Apple', receivedModel: 'iPhone 14', receivedStorage: '128GB', receivedColor: 'Preto', appraisalValue: appraisal, paymentMethod: method, installments, salesOrigin: 'Outro' }));
r = up('111111111111111', 3000, 4000);
check('R1', 'avaliação maior que o preço é recusada', !r.ok && dev('dev-02').status === 'available', r.e);
r = up('12345', 5890, 2000);
check('B7', 'IMEI com menos de 15 dígitos é recusado', !r.ok, r.e);
r = up(' 354892091823712 ', 5890, 2000);
check('B7', 'IMEI de aparelho em estoque (digitado com espaços) é recusado', !r.ok, r.e);
r = up('111111111111111', 5890, 2000, 'dev-02', 'cust-02', 'credit_card', 6);
const upSale = r.ok ? store.sales.find(s => s.id === r.v.sale_id)! : undefined;
check('B4', 'upgrade grava forma de pagamento e parcelas escolhidas', !!upSale && upSale.payments!.some(p => p.payment_method === 'credit_card' && p.installments === 6 && p.amount === 3890), r.ok ? JSON.stringify(upSale!.payments!.map(p => [p.payment_method, p.amount, p.installments])) : r.e);
c = store.cancelSale(upSale!.id, T, ADMIN, 'desistiu');
r = up('111111111111111', 5890, 2500);
check('B5', 'cancelar o upgrade e refazer com o mesmo IMEI funciona', c.ok && r.ok && store.devices.filter(d => d.imei === '111111111111111').length === 1, r.ok ? '' : r.e);
// cliente traz de volta o iPhone 13 (dev-04) comprado na loja, ainda em garantia
const w04 = store.warranties.find(w => w.device_id === 'dev-04' && w.status === 'active');
r = up(dev('dev-04').imei, 4990, 2000, 'dev-03', 'cust-01');
check('B5', 'aparelho vendido pela loja volta em upgrade (mesmo cadastro, origem Upgrade, disponível)', r.ok && r.v.received_device_id === 'dev-04' && dev('dev-04').status === 'available' && dev('dev-04').origin === 'trade_in' && dev('dev-04').acquisition_cost === 2000 && store.devices.filter(d => d.imei === dev('dev-04').imei).length === 1, r.ok ? '' : r.e);
check('B5', 'garantia antiga do aparelho que voltou é encerrada', !!w04 && w04.status === 'cancelled');
c = store.cancelSale(r.v.sale_id, T, ADMIN, 'desistiu');
check('B5', 'cancelar esse upgrade devolve o aparelho ao estado anterior (vendido)', c.ok && dev('dev-04').status === 'sold' && dev('dev-04').origin === 'purchase' && dev('dev-04').acquisition_cost === 2600 && dev('dev-03').status === 'available');
check('B5', 'e a garantia do cliente volta a valer', !!w04 && w04.status === 'active');

// ---- TROCAS / DEVOLUÇÕES
let s = sell('dev-03', 4990);
let req = store.createReturnRequest({ tenantId: T, saleId: s.id, saleItemId: s.items![0].id, userId: SELLER, userRole: 'seller', reason: 'Insatisfação', resolution: 'credit' });
store.updateReturnStatus({ tenantId: T, requestId: req.data!.id, userId: ADMIN, userRole: 'admin', newStatus: 'approved' });
store.completeReturn({ tenantId: T, requestId: req.data!.id, userId: ADMIN, userRole: 'admin', creditAmount: 4990 });
c = store.cancelSale(s.id, T, ADMIN, 'x');
check('R4', 'venda com devolução concluída não pode mais ser cancelada', !c.ok && store.getCustomerCreditBalance(T, 'cust-01') === 4990, c.error);
store.resolveReturnedDevice({ tenantId: T, requestId: req.data!.id, userId: ADMIN, userRole: 'admin', destination: 'stock' });
// crédito usado em nova venda, parte em crédito e parte em pix
r = attempt(() => store.finalizeSale({ ...base, items: [devItem('dev-03', 4990)], payments: [{ paymentMethod: 'store_credit', amount: 4000, installments: 1 }, { paymentMethod: 'pix', amount: 990, installments: 1 }], gifts: [] }));
check('V3', 'crédito do cliente usado em nova venda', r.ok && store.getCustomerCreditBalance(T, 'cust-01') === 990, r.ok ? '' : r.e);
req = store.createReturnRequest({ tenantId: T, saleId: r.v.id, saleItemId: r.v.items[0].id, userId: SELLER, userRole: 'seller', reason: 'Defeito', resolution: 'refund' });
c = store.cancelSale(r.v.id, T, ADMIN, 'erro de lançamento');
check('F6', 'cancelar venda encerra a solicitação de devolução pendente e devolve o crédito usado', c.ok && req.data!.status === 'cancelled' && store.getCustomerCreditBalance(T, 'cust-01') === 4990);

// ---- ASSISTÊNCIA
let o: any = store.createServiceOrder({ tenantId: T, customerId: 'cust-01', sellerId: SELLER, brand: 'Apple', model: 'iPhone 15', imei: dev('dev-01').imei, reportedDefect: 'x' });
check('F3', 'balcão não abre OS externa com IMEI de aparelho do estoque', !o.ok, o.error);
s = sell('dev-01', 6890, 'cust-03');
o = store.createServiceOrder({ tenantId: T, customerId: 'cust-03', sellerId: SELLER, brand: 'Apple', model: 'iPhone 15 Pro Max', imei: dev('dev-01').imei, reportedDefect: 'Não liga' });
check('F3', 'OS aberta pelo balcão reconhece a garantia pelo IMEI e registra movimentação', o.ok && !!o.order.warranty_id && store.getOrderMovements(o.order).length === 1, o.error);
const os = o.order;
check('F1', 'diagnóstico do técnico', store.updateServiceOrderDiagnosis({ tenantId: T, osId: os.id, technicianId: TECH, diagnosis: 'placa', partsCost: 300, serviceCost: 100 }) && os.status === 'quote_pending_admin');
check('S2', 'vendedor não define orçamento', !store.adminSetServiceOrderQuote({ tenantId: T, osId: os.id, adminId: SELLER, clientQuoteAmount: 900 }));
check('F1', 'admin define orçamento', store.adminSetServiceOrderQuote({ tenantId: T, osId: os.id, adminId: ADMIN, clientQuoteAmount: 900 }) && os.status === 'quote_ready');
check('F2', 'recusa sem motivo é rejeitada', !store.updateClientQuoteApproval({ tenantId: T, osId: os.id, sellerId: ADMIN, approved: false }));
check('F2', 'admin registra a recusa do cliente', store.updateClientQuoteApproval({ tenantId: T, osId: os.id, sellerId: ADMIN, approved: false, rejectionReason: 'caro' }) && os.status === 'rejected' && !os.closed_at);
let ret: any = store.returnRejectedOrder({ tenantId: T, osId: os.id, userId: ADMIN });
check('F2', 'devolução sem reparo encerra a OS', ret.ok && !!os.closed_at);
o = store.createServiceOrder({ tenantId: T, customerId: 'cust-03', sellerId: SELLER, brand: 'Apple', model: 'iPhone 15 Pro Max', imei: dev('dev-01').imei, reportedDefect: 'Voltou' });
check('F2', 'nova OS para o mesmo IMEI é aceita depois do encerramento', o.ok, o.error);
const os2 = o.order;
store.updateServiceOrderDiagnosis({ tenantId: T, osId: os2.id, technicianId: TECH, diagnosis: 'tela', partsCost: 200, serviceCost: 50 });
store.adminSetServiceOrderQuote({ tenantId: T, osId: os2.id, adminId: ADMIN, clientQuoteAmount: 600 });
check('F1', 'admin aprova o orçamento em nome do cliente', store.updateClientQuoteApproval({ tenantId: T, osId: os2.id, sellerId: ADMIN, approved: true }) && os2.status === 'in_maintenance');
check('F1', 'técnico conclui e balcão entrega cobrando', store.markServiceOrderReady({ tenantId: T, osId: os2.id, technicianId: TECH }) && store.sellerCheckoutServiceOrder({ tenantId: T, osId: os2.id, sellerId: SELLER, paymentMethod: 'pix', paidAmount: 600 }) && os2.status === 'delivered' && os2.paid_amount === 600);
check('M1', 'OS entregue não aceita novo diagnóstico', !store.updateServiceOrderDiagnosis({ tenantId: T, osId: os2.id, technicianId: TECH, diagnosis: 'reabrir', partsCost: 1, serviceCost: 1 }) && os2.status === 'delivered' && os2.technician_parts_cost === 200);
// assistência interna continua funcionando
addDev('dev-i1', '777777777777777');
o = store.sendDeviceToAssistance({ tenantId: T, deviceId: 'dev-i1', userId: ADMIN, userRole: 'admin', defect: 'bateria' });
store.updateAssistanceStatus({ tenantId: T, osId: o.order.id, userId: TECH, newStatus: 'in_maintenance' });
ret = store.completeInternalAssistance({ tenantId: T, osId: o.order.id, userId: TECH, userRole: 'technician', serviceDone: 'troca de bateria', partsUsed: 'bateria', partsCost: 180, serviceCost: 20 });
check('V4', 'assistência interna soma o custo e devolve ao estoque', ret.ok && dev('dev-i1').status === 'available' && dev('dev-i1').accumulated_repair_cost === 200);

// ---- ARMAZENAMENTO CHEIO
addDev('dev-q1', '888888888888888');
quota.limit = 1000;
r = attempt(() => sell('dev-q1', 3000));
check('B1', 'falha de gravação fica sinalizada para a tela', store.saveFailed === true);
quota.limit = Infinity;
store.saveToStorage();
check('B1', 'sinal some quando a gravação volta a funcionar', store.saveFailed === false);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
