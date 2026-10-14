// ============================================================================
// CONTROLPHONE — ATACADO: ESTOQUE (cadastro simples, sem IMEI/série/garantia)
// ============================================================================

import React, { useState } from 'react';
import { Boxes, Pencil, Plus, Search, Trash2, TruckIcon, PackagePlus } from 'lucide-react';
import { formatBRL } from '../../lib/labels';
import { WholesaleController } from './useWholesale';
import { WholesaleProduct, ProductInput, SupplierInput } from './types';
import { stockUnits, stockValue } from './calc';
import { Card, Empty, Field, Modal, StatCard, btnDanger, btnGhost, btnPrimary, inputCls } from './ui';

const emptyProduct = { name: '', category: '', quantity: '0', cost_price: '', sale_price: '', supplier_id: '', notes: '' };

interface Props {
  ctl: WholesaleController;
  color: string;
  onMessage: (text: string, kind?: 'ok' | 'error') => void;
}

export const WholesaleStock: React.FC<Props> = ({ ctl, color, onMessage }) => {
  const { products, suppliers } = ctl.data;
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<WholesaleProduct | 'new' | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [entry, setEntry] = useState<WholesaleProduct | null>(null);
  const [entryForm, setEntryForm] = useState({ quantity: '', unitCost: '', notes: '' });
  const [removing, setRemoving] = useState<WholesaleProduct | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const supplierName = (id: string | null) => suppliers.find(s => s.id === id)?.name || '—';
  const list = products.filter(p => {
    const t = term.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || (p.category || '').toLowerCase().includes(t);
  });

  const openNew = () => { setForm(emptyProduct); setEditing('new'); };
  const openEdit = (p: WholesaleProduct) => {
    setForm({
      name: p.name, category: p.category || '', quantity: String(p.quantity), cost_price: String(p.cost_price),
      sale_price: String(p.sale_price), supplier_id: p.supplier_id || '', notes: p.notes || ''
    });
    setEditing(p);
  };

  const save = async () => {
    const quantity = Math.floor(Number(form.quantity));
    const cost = Number(form.cost_price);
    const price = Number(form.sale_price);
    if (!form.name.trim()) return onMessage('Informe o nome do produto.', 'error');
    if (!(quantity >= 0) || !(cost >= 0) || !(price >= 0) || form.cost_price === '' || form.sale_price === '') {
      return onMessage('Quantidade, custo e preço de venda devem ser números válidos.', 'error');
    }
    const input: ProductInput = {
      id: editing && editing !== 'new' ? editing.id : undefined,
      name: form.name, category: form.category, quantity, cost_price: cost, sale_price: price,
      supplier_id: form.supplier_id || null, notes: form.notes
    };
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.saveProduct(input));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setEditing(null);
    onMessage(input.id ? 'Produto atualizado.' : 'Produto cadastrado.');
  };

  const saveEntry = async () => {
    if (!entry) return;
    const quantity = Math.floor(Number(entryForm.quantity));
    const unitCost = Number(entryForm.unitCost);
    if (!(quantity > 0) || entryForm.unitCost === '' || !(unitCost >= 0)) {
      return onMessage('Informe a quantidade e o custo unitário da compra.', 'error');
    }
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.registerPurchase({ productId: entry.id, quantity, unitCost, notes: entryForm.notes }));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setEntry(null);
    onMessage('Entrada de estoque registrada.');
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.deleteProduct(removing.id));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setRemoving(null);
    onMessage('Produto excluído.');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Valor em estoque (custo)" value={formatBRL(stockValue(products))} icon={Boxes} />
        <StatCard title="Produtos" value={String(products.length)} icon={Boxes} />
        <StatCard title="Unidades" value={String(stockUnits(products))} icon={Boxes} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Buscar produto ou categoria"
            className={`${inputCls} pl-9`} />
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={() => setSuppliersOpen(true)}>
            <TruckIcon className="w-3.5 h-3.5" /> Fornecedores
          </button>
          <button type="button" className={btnPrimary} style={{ backgroundColor: color }} onClick={openNew}>
            <Plus className="w-3.5 h-3.5" /> Novo produto
          </button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={Boxes} text={products.length === 0 ? 'Nenhum produto cadastrado no Atacado.' : 'Nenhum produto encontrado.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Qtd.</th>
                  <th className="px-4 py-3 text-right">Custo</th>
                  <th className="px-4 py-3 text-right">Venda</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {p.name}
                      {p.notes && <span className="block font-normal text-[11px] text-slate-400 truncate max-w-[220px]">{p.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.category || '—'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${p.quantity === 0 ? 'text-rose-600' : 'text-slate-800'}`}>{p.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatBRL(p.cost_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatBRL(p.sale_price)}</td>
                    <td className="px-4 py-3 text-slate-600">{supplierName(p.supplier_id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" title="Entrada de estoque" aria-label={`Entrada de estoque de ${p.name}`}
                          onClick={() => { setEntry(p); setEntryForm({ quantity: '', unitCost: String(p.cost_price), notes: '' }); }}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><PackagePlus className="w-4 h-4" /></button>
                        <button type="button" title="Editar" aria-label={`Editar ${p.name}`} onClick={() => openEdit(p)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
                        <button type="button" title="Excluir" aria-label={`Excluir ${p.name}`} onClick={() => setRemoving(p)}
                          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo produto do Atacado' : 'Editar produto'}
          onClose={() => setEditing(null)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Cancelar</button>
            <button type="button" className={btnPrimary} style={{ backgroundColor: color }} disabled={busy} onClick={save}>Salvar</button>
          </>}
        >
          <Field label="Produto" required><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria"><input className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Quantidade" required hint={editing === 'new' ? 'Entra como compra no financeiro.' : 'Ajuste manual do estoque.'}>
              <input type="number" min={0} step={1} className={inputCls} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </Field>
            <Field label="Valor de custo (R$)" required><input type="number" min={0} step="0.01" className={inputCls} value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} /></Field>
            <Field label="Valor de venda (R$)" required><input type="number" min={0} step="0.01" className={inputCls} value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} /></Field>
          </div>
          <Field label="Fornecedor">
            <select className={inputCls} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">Sem fornecedor</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Observações"><textarea rows={2} className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </Modal>
      )}

      {entry && (
        <Modal
          title={`Entrada de estoque — ${entry.name}`}
          onClose={() => setEntry(null)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setEntry(null)}>Cancelar</button>
            <button type="button" className={btnPrimary} style={{ backgroundColor: color }} disabled={busy} onClick={saveEntry}>Registrar compra</button>
          </>}
        >
          <p className="text-xs text-slate-500">
            Estoque atual: <strong>{entry.quantity}</strong> · custo atual: <strong>{formatBRL(entry.cost_price)}</strong>.
            O custo do produto passa a ser a média ponderada entre o estoque atual e esta compra.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade" required><input type="number" min={1} step={1} className={inputCls} value={entryForm.quantity} onChange={e => setEntryForm({ ...entryForm, quantity: e.target.value })} /></Field>
            <Field label="Custo unitário (R$)" required><input type="number" min={0} step="0.01" className={inputCls} value={entryForm.unitCost} onChange={e => setEntryForm({ ...entryForm, unitCost: e.target.value })} /></Field>
          </div>
          <Field label="Observações"><input className={inputCls} value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} /></Field>
        </Modal>
      )}

      {removing && (
        <Modal
          title="Excluir produto"
          onClose={() => setRemoving(null)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setRemoving(null)}>Cancelar</button>
            <button type="button" className={btnDanger} disabled={busy} onClick={confirmRemove}>Excluir</button>
          </>}
        >
          <p className="text-sm text-slate-600">
            Excluir <strong>{removing.name}</strong>? As vendas já feitas continuam no histórico.
          </p>
        </Modal>
      )}

      {suppliersOpen && <SuppliersModal ctl={ctl} color={color} onClose={() => setSuppliersOpen(false)} onMessage={onMessage} />}
    </div>
  );
};

const SuppliersModal: React.FC<{
  ctl: WholesaleController; color: string; onClose: () => void; onMessage: Props['onMessage'];
}> = ({ ctl, color, onClose, onMessage }) => {
  const [form, setForm] = useState<SupplierInput>({ name: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return onMessage('Informe o nome do fornecedor.', 'error');
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.saveSupplier(form));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setForm({ name: '', phone: '', notes: '' });
    onMessage('Fornecedor salvo.');
  };
  const remove = async (id: string) => {
    const res = await ctl.run(() => ctl.repo.deleteSupplier(id));
    if (!res.ok) onMessage(res.error, 'error');
  };

  return (
    <Modal title="Fornecedores do Atacado" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Field label="Nome" required><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Telefone"><input className={inputCls} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <button type="button" className={btnPrimary} style={{ backgroundColor: color }} disabled={busy} onClick={save}>
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>
      {ctl.data.suppliers.length === 0 ? (
        <Empty icon={TruckIcon} text="Nenhum fornecedor do Atacado." />
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
          {ctl.data.suppliers.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
              <span className="min-w-0">
                <span className="font-bold text-slate-800 block truncate">{s.name}</span>
                <span className="text-slate-400">{s.phone || 'Sem telefone'}</span>
              </span>
              <button type="button" aria-label={`Excluir ${s.name}`} onClick={() => remove(s.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
