// Reset Geral da Loja (migration 27) num Postgres local com todas as migrations: permissões, pagamento
// confirmado e recusado, falha no arquivamento, reset sem e com arquivamento, comprovantes preservados,
// isolamento entre lojas, aparelho com cópia antiga e o mesmo pedido enviado duas vezes.
// Uso: sh scripts/qa/rodar.sh reset-banco-local
import { boot, as } from './banco-local';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };

const db = await boot();
const A = '11111111-1111-1111-1111-111111111111';     // loja que será reiniciada
const B = '22222222-2222-2222-2222-222222222222';     // outra loja (não pode ser tocada)
const SUPER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000002';
const SELLER = 'aaaaaaaa-0000-0000-0000-000000000003';
const ADMIN_B = 'aaaaaaaa-0000-0000-0000-000000000004';
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];
const rpc = (user: string, sql: string, params: unknown[] = []) => as(db, user, () => one(sql, params));
const tryRpc = async (user: string, sql: string, params: unknown[] = []) => {
  try { return { ok: true, row: await rpc(user, sql, params) }; } catch (e: any) { return { ok: false, error: e.message as string }; }
};

const past = new Date(Date.now() - 86400000 * 30).toISOString();
await db.exec(`
  INSERT INTO tenants (id, name, trade_name, email, phone, created_at) VALUES
    ('${A}', 'Loja A LTDA', 'Loja Alfa', 'a@a', '1', '${past}'), ('${B}', 'Loja B LTDA', 'Loja Beta', 'b@b', '2', '${past}');
  INSERT INTO profiles (id, tenant_id, role, full_name, email) VALUES
    ('${SUPER}', NULL, 'super_admin', 'Super', 's@x'), ('${ADMIN}', '${A}', 'admin', 'Dono A', 'admin@a'),
    ('${SELLER}', '${A}', 'seller', 'Vendedor A', 'seller@a'), ('${ADMIN_B}', '${B}', 'admin', 'Dono B', 'admin@b');
  INSERT INTO tenant_themes (tenant_id, display_name) VALUES ('${A}', 'Loja Alfa') ON CONFLICT DO NOTHING;
`);

// dados operacionais das duas lojas (criados no passado, como num ciclo em uso)
const seed = async (T: string, admin: string, tag: string) => {
  const cust = (await one(`INSERT INTO customers (tenant_id, name, phone, created_at) VALUES ($1, $2, '9', $3) RETURNING id`, [T, `Cliente ${tag}`, past])).id;
  const sup = (await one(`INSERT INTO suppliers (tenant_id, name, phone, created_at) VALUES ($1, $2, '9', $3) RETURNING id`, [T, `Fornecedor ${tag}`, past])).id;
  const dev = (await one(`INSERT INTO devices (tenant_id, imei, brand, model, storage_capacity, color, device_type, origin, acquisition_cost, suggested_price, status, supplier_id, created_at, entry_date)
    VALUES ($1, $2, 'Apple', 'iPhone 15', '128GB', 'Preto', 'lacrado', 'purchase', 4000, 5000, 'sold', $3, $4, $4) RETURNING id`, [T, `35000000000000${tag === 'A' ? 1 : 2}`, sup, past])).id;
  await q(`INSERT INTO devices (tenant_id, imei, brand, model, storage_capacity, color, origin, acquisition_cost, suggested_price, status, created_at, entry_date)
    VALUES ($1, $2, 'Apple', 'iPhone 13', '128GB', 'Azul', 'purchase', 2000, 2600, 'available', $3, $3)`, [T, `35000000000001${tag === 'A' ? 1 : 2}`, past]);
  await q(`INSERT INTO accessories (tenant_id, name, category, quantity, unit_cost, sale_price, created_at) VALUES ($1, 'Capa', 'Capas', 12, 10, 30, $2)`, [T, past]);
  const sale = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
    id: `sale-${tag}-${n}`, tenant_id: T, sale_number: 1000 + n, seller_id: admin, customer_id: cust, sales_origin: 'Instagram',
    subtotal: 5000, discount_amount: 0, total_amount: 5000, total_cost: 4000, gross_profit: 1000, status, created_at: past,
    items: [{ id: `item-${tag}-${n}`, item_type: 'device', device_id: dev, quantity: 1, unit_price: 5000, unit_cost: 4000, discount: 0, total_price: 5000,
      device_type: 'lacrado', device_info: { brand: 'Apple', model: 'iPhone 15', storage_capacity: '128GB', color: 'Preto', imei: `35000000000000${tag === 'A' ? 1 : 2}` } }],
    payments: [{ id: `pay-${tag}-${n}`, payment_method: 'pix', amount: 5000, installments: 1 }], gifts: [], ...extra
  });
  await as(db, admin, async () => {
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'sales', $2, $3)`,
      [T, `sale-${tag}-1`, JSON.stringify(sale(1, 'completed', { card_interest: 200, apple_warranty: { term_id: 'apple', version: '2026-10-21' } }))]);
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'sales', $2, $3)`, [T, `sale-${tag}-2`, JSON.stringify(sale(2, 'completed'))]);
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'warranties', $2, $3)`, [T, `war-${tag}`, JSON.stringify({
      id: `war-${tag}`, tenant_id: T, sale_id: `sale-${tag}-2`, imei: '350000000000001', warranty_days: 90, start_date: '2026-09-01', end_date: '2026-11-30', status: 'active', history: [], created_at: past })]);
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'expenses', $2, $3)`, [T, `exp-${tag}`, JSON.stringify({ id: `exp-${tag}`, tenant_id: T, amount: 300, description: 'Aluguel', created_at: past })]);
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'goals', $2, $3)`, [T, `goal-${tag}`, JSON.stringify({ id: `goal-${tag}`, tenant_id: T, seller_id: admin, month_year: '2026-10', target_device_count: 10 })]);
    await q(`INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'auditLogs', $2, $3)`, [T, `log-${tag}`, JSON.stringify({ id: `log-${tag}`, tenant_id: T, user_id: admin, action: 'VENDA_FINALIZADA', created_at: past })]);
  });
  // a segunda venda é cancelada (só administrador cancela)
  await as(db, admin, () => q(`UPDATE tenant_records SET data = data || '{"status":"cancelled"}' WHERE id = $1`, [`sale-${tag}-2`]));
};
await seed(A, ADMIN, 'A');
await seed(B, ADMIN_B, 'B');
const countB = async () => one(`SELECT (SELECT count(*) FROM devices WHERE tenant_id = $1)::int d, (SELECT count(*) FROM tenant_records WHERE tenant_id = $1)::int r,
  (SELECT count(*) FROM customers WHERE tenant_id = $1)::int c`, [B]);
const before_B = await countB();
const opCount = async (T: string) => one(`SELECT
  (SELECT count(*) FROM devices WHERE tenant_id = $1)::int devices,
  (SELECT count(*) FROM accessories WHERE tenant_id = $1)::int accessories,
  (SELECT count(*) FROM customers WHERE tenant_id = $1)::int customers,
  (SELECT count(*) FROM suppliers WHERE tenant_id = $1)::int suppliers,
  (SELECT count(*) FROM tenant_records WHERE tenant_id = $1 AND kind IN ('sales','warranties','expenses'))::int records,
  (SELECT count(*) FROM tenant_records WHERE tenant_id = $1 AND kind IN ('auditLogs','goals'))::int kept`, [T]);
const startA = await opCount(A);
// só os dados operacionais (o histórico de atividades cresce de propósito com pedidos e pagamentos)
const ops = (c: any) => JSON.stringify({ ...c, kept: undefined });

// ---- permissões
const req = () => crypto.randomUUID();
const denied = await rpc(ADMIN, `SELECT reset_tenant_cycle($1, 'no_archive', 'Loja Alfa', $2) r`, [A, req()]);
const deniedSeller = await rpc(SELLER, `SELECT reset_tenant_cycle($1, 'no_archive', 'Loja Alfa', $2) r`, [A, req()]);
check('administrador e vendedor da loja não conseguem reiniciar (conferido no banco)',
  denied.r.ok === false && deniedSeller.r.ok === false && ops(await opCount(A)) === ops(startA), JSON.stringify(denied.r));
check('tentativas sem permissão ficam registradas', (await one(`SELECT count(*)::int n FROM tenant_reset_runs WHERE tenant_id = $1 AND status = 'denied'`, [A])).n === 2);
const adminPrice = await tryRpc(ADMIN, `SELECT set_archive_price(150)`);
const adminOrder = await tryRpc(ADMIN, `SELECT create_archive_order($1)`, [A]);
check('administrador da loja não define preço nem cria/confirma pagamento', !adminPrice.ok && !adminOrder.ok);

// ---- preço, pedido, pagamento recusado
check('Super Admin define o valor do arquivamento', (await rpc(SUPER, `SELECT set_archive_price(149.9) r`)).r.amount == 149.9);
const order1 = (await rpc(SUPER, `SELECT create_archive_order($1) r`, [A])).r;
const dup = await tryRpc(SUPER, `SELECT create_archive_order($1)`, [A]);
check('pedido de arquivamento criado com o valor configurado; segundo pedido em aberto é recusado (sem cobrança duplicada)',
  order1.ok && Number(order1.amount) === 149.9 && !dup.ok, dup.ok ? 'duplicou' : '');
const pending = await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'Loja Alfa', $2, $3) r`, [A, req(), order1.id]);
check('pagamento ainda não confirmado: reset com arquivamento não executa e nada muda',
  pending.r.ok === false && /não está confirmado/.test(pending.r.error) && ops(await opCount(A)) === ops(startA), pending.r.error);
await rpc(SUPER, `SELECT refuse_archive_order($1, 'Cartão recusado') r`, [order1.id]);
const refused = await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'Loja Alfa', $2, $3) r`, [A, req(), order1.id]);
check('pagamento recusado: reset com arquivamento não executa',
  refused.r.ok === false && /refused/.test(refused.r.error) && ops(await opCount(A)) === ops(startA), refused.r.error);
const noRef = await tryRpc(SUPER, `SELECT confirm_archive_payment($1, '')`, [order1.id]);
check('pagamento só é registrado com referência e só em pedido aguardando', !noRef.ok);

// ---- falha no arquivamento: nada muda
const order2 = (await rpc(SUPER, `SELECT create_archive_order($1) r`, [A])).r;
await rpc(SUPER, `SELECT confirm_archive_payment($1, 'PIX E2E123456') r`, [order2.id]);
const failArch = await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'Loja Alfa', $2, $3, 'archive') r`, [A, req(), order2.id]);
const order2After = await one(`SELECT status FROM tenant_archive_orders WHERE id = $1`, [order2.id]);
check('falha no arquivamento: o reset não acontece, o pedido pago continua disponível e a falha fica registrada',
  failArch.r.ok === false && ops(await opCount(A)) === ops(startA) && order2After.status === 'paid' &&
  (await one(`SELECT count(*)::int n FROM tenant_reset_runs WHERE tenant_id = $1 AND status = 'failed'`, [A])).n >= 3 &&
  (await one(`SELECT count(*)::int n FROM preserved_sale_documents WHERE tenant_id = $1`, [A])).n === 0, failArch.r.error);
const wrongName = await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'loja alfa', $2, $3) r`, [A, req(), order2.id]);
check('nome da loja digitado diferente: não executa', wrongName.r.ok === false && /nome/.test(wrongName.r.error));

// ---- reset COM arquivamento (Ciclo 1 → 2)
const reqArchive = req();
const res1 = (await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'Loja Alfa', $2, $3) r`, [A, reqArchive, order2.id])).r;
const after1 = await opCount(A);
check('reset com arquivamento: estoque, vendas, financeiro, clientes e fornecedores zerados',
  res1.ok && after1.devices === 0 && after1.accessories === 0 && after1.customers === 0 && after1.suppliers === 0 && after1.records === 0, JSON.stringify({ res1, after1 }));
check('metas configuradas e histórico de atividades preservados', after1.kept >= startA.kept);
const cycles = await q(`SELECT number, status, archive_status, summary FROM tenant_cycles WHERE tenant_id = $1 ORDER BY number`, [A]);
check('Ciclo 1 encerrado e arquivado com os números do ciclo; Ciclo 2 ativo',
  cycles.length === 2 && cycles[0].status === 'closed' && cycles[0].archive_status === 'archived' && cycles[1].status === 'active' &&
  Number(cycles[0].summary.sales) === 1 && Number(cycles[0].summary.revenue) === 5200 && Number(cycles[0].summary.expenses) === 300 && Number(cycles[0].summary.devices_sold) === 1,
  JSON.stringify(cycles.map(c => [c.number, c.status, c.archive_status, c.summary])));
check('pedido de arquivamento usado uma única vez', (await one(`SELECT status FROM tenant_archive_orders WHERE id = $1`, [order2.id])).status === 'used');
const again = (await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'archive', 'Loja Alfa', $2, $3) r`, [A, reqArchive, order2.id])).r;
check('mesmo pedido de reset enviado de novo: responde "já feito" sem criar outro ciclo',
  again.ok && again.already && (await one(`SELECT count(*)::int n FROM tenant_cycles WHERE tenant_id = $1`, [A])).n === 2);

// histórico arquivado: administrador da loja lê, outra loja não
const cycle1 = (await one(`SELECT id FROM tenant_cycles WHERE tenant_id = $1 AND number = 1`, [A])).id;
const archive = (await rpc(ADMIN, `SELECT get_cycle_archive($1) a`, [cycle1])).a;
check('Históricos Arquivados: o administrador da loja consulta vendas, estoque, clientes e despesas do Ciclo 1',
  archive.tables.devices.length === 2 && archive.tables.customers.length === 1 &&
  archive.tables.tenant_records.filter((r: any) => r.kind === 'sales').length === 2 && archive.tables.tenant_records.some((r: any) => r.kind === 'expenses'));
const otherStore = await tryRpc(ADMIN_B, `SELECT get_cycle_archive($1)`, [cycle1]);
const sellerArchive = await tryRpc(SELLER, `SELECT get_cycle_archive($1)`, [cycle1]);
check('outra loja e o vendedor não acessam o histórico arquivado', !otherStore.ok && !sellerArchive.ok);

// comprovantes e garantias preservados
const docs = await q(`SELECT sale_number, sale_status, customer_name, products, imeis, warranties, payload FROM preserved_sale_documents WHERE tenant_id = $1 ORDER BY sale_number`, [A]);
check('comprovantes e garantias preservados: nº da venda, data, cliente, produto, IMEI, garantia e dados para o PDF',
  docs.length === 2 && docs[0].sale_number === 1001 && docs[0].customer_name === 'Cliente A' && docs[0].products.includes('iPhone 15') &&
  docs[0].imeis[0] === '350000000000001' && docs[0].warranties.some((w: any) => w.type === 'apple') &&
  docs[1].warranties.some((w: any) => w.days === 90) && docs[0].payload.sale.items.length === 1 && docs[0].payload.devices.length === 1 && docs[0].payload.customer.name === 'Cliente A',
  JSON.stringify(docs.map(d => [d.sale_number, d.customer_name, d.imeis, d.warranties])));
const docsAdmin = (await rpc(ADMIN, `SELECT count(*)::int n FROM preserved_sale_documents`)).n;
const docsSeller = (await rpc(SELLER, `SELECT count(*)::int n FROM preserved_sale_documents`)).n;
const docsOther = (await rpc(ADMIN_B, `SELECT count(*)::int n FROM preserved_sale_documents`)).n;
check('documentos preservados: só o administrador da própria loja vê', docsAdmin === 2 && docsSeller === 0 && docsOther === 0, `${docsAdmin}/${docsSeller}/${docsOther}`);

// isolamento entre lojas
check('a outra loja não foi tocada', JSON.stringify(await countB()) === JSON.stringify(before_B) &&
  (await one(`SELECT count(*)::int n FROM tenant_cycles WHERE tenant_id = $1`, [B])).n === 0);

// identidade, usuários e numeração preservados
const kept = await one(`SELECT (SELECT trade_name FROM tenants WHERE id = $1) name, (SELECT status FROM tenants WHERE id = $1) status,
  (SELECT count(*) FROM profiles WHERE tenant_id = $1)::int users, (SELECT display_name FROM tenant_themes WHERE tenant_id = $1) theme`, [A]);
check('loja, situação, usuários e identidade visual preservados', kept.name === 'Loja Alfa' && kept.status === 'active' && kept.users === 2 && kept.theme === 'Loja Alfa');

// aparelho com a cópia antiga reenviando dados do ciclo encerrado
const stale = await tryRpc(SELLER, `INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'sales', 'sale-A-1', $2) RETURNING id`,
  [A, JSON.stringify({ id: 'sale-A-1', tenant_id: A, sale_number: 1001, seller_id: SELLER, status: 'completed', created_at: past, items: [] })]);
const staleDevice = await tryRpc(ADMIN, `INSERT INTO devices (tenant_id, imei, brand, model, storage_capacity, color, origin, status, created_at, entry_date)
  VALUES ($1, '359999999999991', 'Apple', 'iPhone 12', '64GB', 'Preto', 'purchase', 'available', $2, $2) RETURNING id`, [A, past]);
check('dados do ciclo encerrado reenviados por aparelho desatualizado são recusados (venda e estoque)',
  !stale.ok && /CICLO_ENCERRADO/.test(stale.error) && !staleDevice.ok, stale.ok ? 'aceitou' : '');
const now = new Date().toISOString();
const fresh = await tryRpc(SELLER, `INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ($1, 'sales', 'sale-A-new', $2) RETURNING id`,
  [A, JSON.stringify({ id: 'sale-A-new', tenant_id: A, sale_number: 1003, seller_id: SELLER, status: 'completed', total_amount: 100, created_at: now, items: [] })]);
check('nova venda do Ciclo 2 é aceita normalmente', fresh.ok, fresh.error);
const active = (await rpc(SELLER, `SELECT my_active_cycle() c`)).c;
check('qualquer usuário da loja descobre o ciclo ativo (para descartar a cópia antiga)', active?.number === 2);

// ---- reset SEM arquivamento (Ciclo 2 → 3)
const res2 = (await rpc(SUPER, `SELECT reset_tenant_cycle($1, 'no_archive', 'Loja Alfa', $2) r`, [A, req()])).r;
const c2 = await one(`SELECT archive_status FROM tenant_cycles WHERE tenant_id = $1 AND number = 2`, [A]);
const archive2 = await tryRpc(ADMIN, `SELECT get_cycle_archive((SELECT id FROM tenant_cycles WHERE tenant_id = $1 AND number = 2))`, [A]);
const docs2 = await q(`SELECT sale_number, cycle_number FROM preserved_sale_documents WHERE tenant_id = $1 ORDER BY sale_number`, [A]);
check('reset sem arquivamento: Ciclo 3 ativo, Ciclo 2 sem histórico consultável',
  res2.ok && res2.new_cycle_number === 3 && c2.archive_status === 'not_archived' && !archive2.ok, JSON.stringify(res2));
check('sem pagar, o comprovante da venda do Ciclo 2 também fica preservado (e os do Ciclo 1 continuam)',
  docs2.length === 3 && docs2.some(d => d.sale_number === 1003 && d.cycle_number === 2) && docs2.filter(d => d.cycle_number === 1).length === 2, JSON.stringify(docs2));
const counter = await one(`SELECT last_number FROM tenant_counters WHERE tenant_id = $1 AND kind = 'sales'`, [A]);
check('número de venda não é reutilizado: o contador da loja continua de onde parou (1003)', counter?.last_number >= 1003, JSON.stringify(counter));
check('backups de segurança gerados antes de cada reset (só o Super Admin vê)',
  (await one(`SELECT count(*)::int n FROM tenant_backups WHERE tenant_id = $1 AND type = 'pre_restore'`, [A])).n === 2);
check('registro de cada execução: modalidade, ciclos, pagamento e arquivamento',
  (await q(`SELECT mode, closed_cycle_number, new_cycle_number, payment_status, archive_status FROM tenant_reset_runs WHERE tenant_id = $1 AND status = 'completed' ORDER BY created_at`, [A]))
    .map(r => `${r.mode}:${r.closed_cycle_number}->${r.new_cycle_number}:${r.payment_status ?? ''}:${r.archive_status}`).join() === 'archive:1->2:paid:archived,no_archive:2->3::not_archived');

// tabelas do módulo fora do backup e da restauração
const plan = (await one(`SELECT backup_table_order() o`)).o as string[];
check('tabelas de ciclos e documentos preservados ficam fora de backup e restauração',
  !plan.includes('tenant_cycles') && !plan.includes('preserved_sale_documents') && !plan.includes('tenant_cycle_archives'));
const rerun = await tryRpc(SUPER, `SELECT 1`);
check('banco segue respondendo após os resets', rerun.ok);

console.log(`\n${pass} verificações passaram, ${failN} falharam`);
process.exit(failN ? 1 : 0);
