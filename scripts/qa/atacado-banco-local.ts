import { boot, as } from './banco-local';
const db = await boot(20);
const q = async (sql: string, p?: any[]): Promise<any[]> => (await db.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (id: string, desc: string, ok: boolean, extra: any = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'FALHOU'} [${id}] ${desc}${extra ? ' — ' + extra : ''}`); };
const rejects = async (fn: () => Promise<any>): Promise<string | null> => { try { await fn(); return null; } catch (e: any) { return e.message; } };
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SUPER = 'aaaaaaaa-0000-0000-0000-000000000001', ADM = 'aaaaaaaa-0000-0000-0000-00000000000a', SEL = 'aaaaaaaa-0000-0000-0000-00000000000b', TEC = 'aaaaaaaa-0000-0000-0000-00000000000d', ADM_B = 'aaaaaaaa-0000-0000-0000-00000000000c';
await db.exec(`
  INSERT INTO tenants (id, name, trade_name, email, phone) VALUES ('${A}', 'A', 'A', 'a@a', '1'), ('${B}', 'B', 'B', 'b@b', '2');
  INSERT INTO profiles (id, tenant_id, role, full_name, email) VALUES ('${SUPER}', NULL, 'super_admin', 'Super', 's@s'), ('${ADM}', '${A}', 'admin', 'Adm', 'a1'),
   ('${SEL}', '${A}', 'seller', 'Vend', 'a2'), ('${TEC}', '${A}', 'technician', 'Tec', 'a3'), ('${ADM_B}', '${B}', 'admin', 'AdmB', 'b1');
  INSERT INTO tenant_settings (tenant_id) VALUES ('${A}'), ('${B}');
`);
const ins = (u: string, t = A) => as(db, u, () => q(`insert into wholesale_products (tenant_id, name, sale_price) values ($1, 'Cabo', 25) returning id`, [t]));
let e = await rejects(() => ins(ADM));
check('W1', 'módulo desligado: administrador não grava', !!e, e);
e = await rejects(() => as(db, ADM, () => q(`select wholesale_set_seller_access($1, true)`, [A])));
check('W2', 'módulo desligado: administrador não libera vendedor', !!e);
e = await rejects(() => as(db, ADM, () => q(`update tenant_settings set wholesale = true where tenant_id = $1 returning 1`, [A])));
const still = (await q(`select wholesale from tenant_settings where tenant_id=$1`, [A]))[0].wholesale;
check('W3', 'administrador da loja não liga o módulo', still === false);
await as(db, SUPER, () => q(`update tenant_settings set wholesale = true where tenant_id = $1`, [A]));
check('W4', 'super admin liga o módulo', (await q(`select wholesale from tenant_settings where tenant_id=$1`, [A]))[0].wholesale === true);

const pid = (await ins(ADM))[0].id;
await as(db, ADM, () => q(`select wholesale_register_purchase($1, $2, 100, 10, 'Estoque inicial')`, [A, pid]));
await as(db, ADM, () => q(`select wholesale_register_purchase($1, $2, 100, 20, NULL)`, [A, pid]));
let p = (await q(`select quantity, cost_price from wholesale_products where id=$1`, [pid]))[0];
check('W5', 'entrada de estoque: custo médio ponderado', p.quantity === 200 && Number(p.cost_price) === 15, JSON.stringify(p));
const cid = (await as(db, ADM, () => q(`insert into wholesale_customers (tenant_id, name) values ($1, 'Mercadinho') returning id`, [A])))[0].id;

// vendedor sem permissão / técnico / outra loja
check('W6', 'vendedor sem permissão não vê produtos', (await as(db, SEL, () => q(`select * from wholesale_products`))).length === 0);
e = await rejects(() => as(db, SEL, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 0, 'PIX')`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 1 }])])));
check('W7', 'vendedor sem permissão não vende', !!e, e);
check('W8', 'outra loja não vê nada', (await as(db, ADM_B, () => q(`select * from wholesale_products`))).length === 0);
e = await rejects(() => as(db, ADM_B, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 0, 'PIX')`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 1 }])])));
check('W9', 'administrador de outra loja não vende nesta', !!e, e);

await as(db, ADM, () => q(`select wholesale_set_seller_access($1, true)`, [A]));
check('W10', 'vendedor liberado vê produtos e clientes', (await as(db, SEL, () => q(`select * from wholesale_products`))).length === 1 && (await as(db, SEL, () => q(`select * from wholesale_customers`))).length === 1);
check('W11', 'técnico continua sem acesso', (await as(db, TEC, () => q(`select * from wholesale_products`))).length === 0);
e = await rejects(() => as(db, SEL, () => q(`update wholesale_products set quantity = 9999 where id = $1 returning 1`, [pid])));
check('W12', 'vendedor não altera estoque direto', (await q(`select quantity from wholesale_products where id=$1`, [pid]))[0].quantity === 200);
check('W13', 'vendedor não vê financeiro', (await as(db, SEL, () => q(`select * from wholesale_transactions`))).length === 0);

e = await rejects(() => as(db, SEL, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 0, 'PIX')`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 500 }])])));
check('W14', 'estoque insuficiente é recusado', !!e && /insuficiente/.test(e), e);
e = await rejects(() => as(db, SEL, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 0, 'PIX')`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 150 }, { product_id: pid, quantity: 150 }])])));
check('W15', 'linhas repetidas somam para o estoque e a venda é desfeita inteira', !!e && (await q(`select quantity from wholesale_products where id=$1`, [pid]))[0].quantity === 200 && (await q(`select count(*)::int n from wholesale_sales`))[0].n === 0, e);
e = await rejects(() => as(db, SEL, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 9999, 'PIX')`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 1 }])])));
check('W16', 'desconto maior que a venda é recusado', !!e);

const sid = (await as(db, SEL, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 50, 'PIX', 'obs') id`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 10, unit_price: 25 }])])))[0].id;
const sale = (await q(`select * from wholesale_sales where id=$1`, [sid]))[0];
check('W17', 'venda: número 1, total 200, custo 150, vendedor certo', sale.sale_number === 1 && Number(sale.total) === 200 && Number(sale.cost_total) === 150 && sale.seller_id === SEL && sale.seller_name === 'Vend', JSON.stringify(sale));
p = (await q(`select quantity from wholesale_products where id=$1`, [pid]))[0];
const c = (await q(`select total_purchased, purchases_count, last_purchase_at from wholesale_customers where id=$1`, [cid]))[0];
const tx = (await q(`select type, amount, cost from wholesale_transactions where sale_id=$1`, [sid]))[0];
check('W18', 'baixa estoque, lança financeiro e atualiza cliente', p.quantity === 190 && Number(c.total_purchased) === 200 && c.purchases_count === 1 && !!c.last_purchase_at && tx.type === 'sale' && Number(tx.amount) === 200 && Number(tx.cost) === 150);
check('W19', 'vendedor vê a própria venda e os itens', (await as(db, SEL, () => q(`select * from wholesale_sales`))).length === 1 && (await as(db, SEL, () => q(`select * from wholesale_sale_items`))).length === 1);
const s2 = (await as(db, ADM, () => q(`select wholesale_finalize_sale($1, $2, $3::jsonb, 0, 'Dinheiro') id`, [A, cid, JSON.stringify([{ product_id: pid, quantity: 1 }])])))[0].id;
check('W20', 'numeração segue (2) e vendedor não vê a venda do administrador', (await q(`select sale_number from wholesale_sales where id=$1`, [s2]))[0].sale_number === 2 && (await as(db, SEL, () => q(`select * from wholesale_sales`))).length === 1);
e = await rejects(() => as(db, ADM, () => q(`insert into wholesale_transactions (tenant_id, type, description, amount) values ($1, 'sale', 'falsa', 999)`, [A])));
check('W21', 'ninguém lança venda falsa direto no financeiro', !!e, e);
await as(db, ADM, () => q(`insert into wholesale_transactions (tenant_id, type, description, amount) values ($1, 'expense', 'Frete', 20)`, [A]));
e = await rejects(() => as(db, ADM, () => q(`insert into wholesale_sales (tenant_id, sale_number, customer_name, seller_id, subtotal, total, payment_method) values ($1, 99, 'x', $2, 1, 1, 'PIX')`, [A, ADM])));
check('W22', 'venda só nasce pela função', !!e);
e = await rejects(() => as(db, SEL, () => q(`insert into wholesale_customers (tenant_id, name, total_purchased) values ($1, 'Fraude', 99999)`, [A])));
check('W23', 'cliente novo não nasce com total comprado', !!e);
check('W24', 'vendedor cadastra cliente', (await as(db, SEL, () => q(`insert into wholesale_customers (tenant_id, name) values ($1, 'Novo') returning id`, [A]))).length === 1);
// isolamento do varejo
const retail = (await q(`select (select count(*) from customers)+(select count(*) from sales)+(select count(*) from devices)+(select count(*) from expenses)+(select count(*) from tenant_records) n`))[0].n;
check('W25', 'nada foi gravado em tabelas do varejo', Number(retail) === 0);
// desligar o módulo fecha tudo
await as(db, SUPER, () => q(`update tenant_settings set wholesale = false where tenant_id = $1`, [A]));
check('W26', 'módulo desligado: nem administrador nem super admin leem', (await as(db, ADM, () => q(`select * from wholesale_sales`))).length === 0 && (await as(db, SUPER, () => q(`select * from wholesale_sales`))).length === 0);
console.log(`\n${pass} ok, ${fail} falharam`);
process.exit(fail ? 1 : 0);
