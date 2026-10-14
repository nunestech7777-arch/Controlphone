import './shim';
import { store } from '../../src/lib/store';
import { createLocalRepo } from '../../src/modules/wholesale/data';
import { productPerformance, summarize, stockValue } from '../../src/modules/wholesale/calc';
import { isViewAvailable, moduleOfView } from '../../src/modules/registry';

const T = 'tenant-itech-01';
let pass = 0, failN = 0;
const check = (id: string, desc: string, ok: boolean, extra = '') => {
  ok ? pass++ : failN++;
  console.log(`${ok ? 'OK  ' : 'FALHOU'} [${id}] ${desc}${extra ? ' — ' + extra : ''}`);
};
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e.message as string; } };

const run = async () => {
  // ---- Módulo: opcional e desligado por padrão
  const f = store.getTenantFeatures('loja-sem-config');
  check('M1', 'Atacado começa desligado numa loja sem configuração', f.wholesale === false);
  check('M2', 'tela do Atacado fica indisponível com o módulo desligado', !isViewAvailable('wholesale', f));
  check('M3', 'Assistência continua ligada por padrão', isViewAvailable('admin-service-orders', f));
  check('M4', 'tela comum do varejo nunca é bloqueada', isViewAvailable('admin-inventory', f) && !moduleOfView('admin-inventory'));
  check('M5', 'permissão de vendedor exige o módulo ligado', !store.wholesaleSellerSalesEnabled(T));

  // ---- Isolamento: snapshot do varejo antes
  const retail = JSON.stringify([store.devices, store.accessories, store.customers, store.sales, store.expenses]);

  const repo = createLocalRepo(T, 'user-admin-01', 'Admin');
  const sup = await repo.saveSupplier({ name: 'Distribuidora X', phone: '', notes: '' });
  await repo.saveProduct({ name: 'Cabo USB-C', category: 'Acessórios', quantity: 100, cost_price: 10, sale_price: 25, supplier_id: sup, notes: '' });
  await repo.saveProduct({ name: 'Capa', category: 'Acessórios', quantity: 50, cost_price: 4, sale_price: 12, supplier_id: null, notes: '' });
  let snap = await repo.load('admin');
  const cabo = snap.products.find(p => p.name === 'Cabo USB-C')!;
  const capa = snap.products.find(p => p.name === 'Capa')!;
  check('P1', 'estoque inicial vira compra no financeiro', snap.transactions.filter(t => t.type === 'purchase').length === 2
    && summarize(snap.transactions).purchases === 1000 + 200);
  check('P2', 'valor em estoque a custo', stockValue(snap.products) === 1200);

  await repo.registerPurchase({ productId: cabo.id, quantity: 100, unitCost: 20, notes: '' });
  snap = await repo.load('admin');
  const cabo2 = snap.products.find(p => p.id === cabo.id)!;
  check('P3', 'entrada de estoque usa custo médio ponderado', cabo2.quantity === 200 && cabo2.cost_price === 15, `${cabo2.quantity} / ${cabo2.cost_price}`);
  check('P4', 'valor de venda não muda com a compra', cabo2.sale_price === 25);

  const cust = await repo.saveCustomer({ name: 'Mercadinho Sul', company: 'Sul LTDA', document: '', phone: '', whatsapp: '', email: '', city: 'Recife', state: 'PE', notes: '' });

  // ---- Venda
  let err = await rejects(() => repo.finalizeSale({ customerId: cust, items: [{ product_id: cabo.id, quantity: 500, unit_price: 25 }], discount: 0, paymentMethod: 'PIX', notes: '' }));
  check('S1', 'estoque insuficiente é recusado', !!err && /insuficiente/i.test(err), err || '');
  err = await rejects(() => repo.finalizeSale({ customerId: cust, items: [
    { product_id: cabo.id, quantity: 150, unit_price: 25 }, { product_id: cabo.id, quantity: 150, unit_price: 25 }
  ], discount: 0, paymentMethod: 'PIX', notes: '' }));
  check('S2', 'linhas repetidas somam para conferir o estoque', !!err);
  err = await rejects(() => repo.finalizeSale({ customerId: cust, items: [{ product_id: cabo.id, quantity: 1, unit_price: 25 }], discount: 999, paymentMethod: 'PIX', notes: '' }));
  check('S3', 'desconto maior que a venda é recusado', !!err);
  snap = await repo.load('admin');
  check('S4', 'recusas não baixam estoque nem lançam nada', snap.products.find(p => p.id === cabo.id)!.quantity === 200 && snap.sales.length === 0);

  await repo.finalizeSale({ customerId: cust, items: [
    { product_id: cabo.id, quantity: 10, unit_price: 25 }, { product_id: capa.id, quantity: 20, unit_price: 12 }
  ], discount: 40, paymentMethod: 'PIX', notes: '' });
  snap = await repo.load('admin');
  const sale = snap.sales[0];
  check('S5', 'total = subtotal − desconto', sale.subtotal === 490 && sale.total === 450, `${sale.subtotal}/${sale.total}`);
  check('S6', 'baixa só o estoque do Atacado', snap.products.find(p => p.id === cabo.id)!.quantity === 190 && snap.products.find(p => p.id === capa.id)!.quantity === 30);
  const c = snap.customers[0];
  check('S7', 'cliente acumula compra e última compra', c.total_purchased === 450 && c.purchases_count === 1 && !!c.last_purchase_at);
  const fin = summarize(snap.transactions);
  check('F1', 'lucro bruto = receita − custo (custo congelado: 10×15 + 20×4 = 230)', fin.revenue === 450 && fin.cogs === 230 && fin.grossProfit === 220, JSON.stringify(fin));

  await repo.addExpense({ description: 'Frete', amount: 20, occurredAt: '2026-10-13T12:00:00' });
  snap = await repo.load('admin');
  const fin2 = summarize(snap.transactions);
  check('F2', 'lucro líquido = bruto − despesas; compras não entram no lucro', fin2.netProfit === 200 && fin2.expenses === 20 && fin2.purchases === 1000 + 200 + 2000);

  const perf = productPerformance(snap.sales);
  check('F3', 'lucro por produto fecha com o lucro bruto (desconto rateado)',
    Math.abs(perf.reduce((a, r) => a + r.profit, 0) - fin2.grossProfit) < 0.02, JSON.stringify(perf.map(p => [p.name, p.profit])));

  // preço de custo congelado: nova compra não altera a venda antiga
  await repo.registerPurchase({ productId: cabo.id, quantity: 10, unitCost: 100, notes: '' });
  snap = await repo.load('admin');
  check('F4', 'custo da venda antiga não muda depois de nova compra', snap.sales[0].cost_total === 230);

  // excluir cliente mantém histórico
  await repo.deleteCustomer(cust);
  snap = await repo.load('admin');
  check('C1', 'excluir cliente mantém o nome nas vendas', snap.sales.length === 1 && snap.sales[0].customer_name === 'Mercadinho Sul');

  // ---- Isolamento do varejo
  const retailAfter = JSON.stringify([store.devices, store.accessories, store.customers, store.sales, store.expenses]);
  check('I1', 'varejo (aparelhos, acessórios, clientes, vendas, despesas) não foi tocado', retail === retailAfter);
  const other = createLocalRepo('outra-loja', 'u', 'U');
  check('I2', 'outra loja não enxerga o Atacado desta', (await other.load('admin')).products.length === 0);

  console.log(`\n${pass} ok, ${failN} falharam`);
  process.exit(failN ? 1 : 0);
};
run();
