import { ADMIN_EMAIL, PASSWORD } from './contas.mjs';
// Teste das regras de acesso de clientes e fornecedores com as contas da loja teste
import { login } from './conexao.mjs';
const out = (ok, msg, extra = '') => console.log(`${ok ? 'OK  ' : 'FALHOU'} ${msg}${extra ? ' — ' + extra : ''}`);
const admin = await login(ADMIN_EMAIL, PASSWORD);
const other = await login(process.argv[2], PASSWORD);
const T = admin.me.tenant_id;
const id = crypto.randomUUID(), sid = crypto.randomUUID();
console.log(`admin=${admin.me.role} | segunda conta=${other.me.role}`);

let r = await admin.c.from('customers').upsert({ id, tenant_id: T, name: 'Cliente Sonda QA', phone: '(11) 90000-0000', cpf: null, birth_date: '1990-10-12' }, { onConflict: 'id' });
out(!r.error, 'admin cadastra cliente', r.error?.message);
r = await admin.c.from('customers').upsert({ id, tenant_id: T, name: 'Cliente Sonda QA (editado)', phone: '(11) 90000-0000', email: 'sonda@teste.com' }, { onConflict: 'id' });
out(!r.error, 'admin edita o mesmo cliente (upsert)', r.error?.message);
r = await admin.c.from('customers').select('*').eq('id', id).maybeSingle();
out(r.data?.name === 'Cliente Sonda QA (editado)' && r.data?.email === 'sonda@teste.com', 'admin lê o cliente atualizado');
r = await other.c.from('customers').select('id, name').eq('id', id).maybeSingle();
out(Boolean(r.data), `${other.me.role} da mesma loja enxerga o cliente`, r.error?.message);
r = await other.c.from('customers').insert({ tenant_id: T, name: 'Não deveria', phone: '0' }).select('id');
const expectInsert = other.me.role === 'seller';
out(expectInsert ? !r.error : Boolean(r.error), `${other.me.role} ${expectInsert ? 'consegue' : 'NÃO consegue'} cadastrar cliente`, r.error?.message);
if (!r.error && r.data?.[0]) await admin.c.from('customers').delete().eq('id', r.data[0].id);
r = await other.c.from('customers').delete().eq('id', id).select('id');
out(!r.data || r.data.length === 0, `${other.me.role} não consegue excluir cliente`);
r = await admin.c.from('customers').insert({ tenant_id: crypto.randomUUID(), name: 'Outra loja', phone: '0' });
out(Boolean(r.error), 'admin não grava cliente em outra loja', r.error?.message);

r = await admin.c.from('suppliers').upsert({ id: sid, tenant_id: T, name: 'Fornecedor Sonda QA', phone: '(11) 3000-0000' }, { onConflict: 'id' });
out(!r.error, 'admin cadastra fornecedor', r.error?.message);
r = await other.c.from('suppliers').select('id').eq('id', sid);
out((r.data || []).length === 0, `${other.me.role} não enxerga fornecedores`);
r = await admin.c.from('suppliers').delete().eq('id', sid).select('id');
out(r.data?.length === 1, 'admin exclui fornecedor', r.error?.message);
r = await admin.c.from('customers').delete().eq('id', id).select('id');
out(r.data?.length === 1, 'admin exclui o cliente de teste (limpeza)', r.error?.message);
