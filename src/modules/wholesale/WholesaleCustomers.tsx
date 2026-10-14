// ============================================================================
// CONTROLPHONE — ATACADO: CLIENTES (cadastro exclusivo, fora do CRM do varejo)
// ============================================================================

import React, { useState } from 'react';
import { MessageCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { formatBRL } from '../../lib/labels';
import { WholesaleController } from './useWholesale';
import { CustomerInput, WholesaleCustomer } from './types';
import { Card, Empty, Field, Modal, BRAZIL_STATES, btnDanger, btnGhost, btnPrimary, formatDate, inputCls } from './ui';

const emptyForm: CustomerInput = {
  name: '', company: '', document: '', phone: '', whatsapp: '', email: '', city: '', state: '', notes: ''
};

export const CustomerFormModal: React.FC<{
  initial?: WholesaleCustomer;
  color: string;
  onClose: () => void;
  onSave: (input: CustomerInput) => Promise<string | null>;
}> = ({ initial, color, onClose, onSave }) => {
  const [form, setForm] = useState<CustomerInput>(initial ? {
    id: initial.id, name: initial.name, company: initial.company || '', document: initial.document || '',
    phone: initial.phone || '', whatsapp: initial.whatsapp || '', email: initial.email || '',
    city: initial.city || '', state: initial.state || '', notes: initial.notes || ''
  } : emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof CustomerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async () => {
    if (!form.name.trim()) return setError('Informe o nome do cliente.');
    setBusy(true);
    const failure = await onSave(form);
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <Modal
      title={initial ? 'Editar cliente do Atacado' : 'Novo cliente do Atacado'}
      onClose={onClose}
      wide
      footer={<>
        <button type="button" className={btnGhost} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPrimary} style={{ backgroundColor: color }} disabled={busy} onClick={submit}>Salvar</button>
      </>}
    >
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nome" required><input className={inputCls} value={form.name} onChange={set('name')} /></Field>
        <Field label="Empresa"><input className={inputCls} value={form.company} onChange={set('company')} /></Field>
        <Field label="CPF/CNPJ"><input className={inputCls} value={form.document} onChange={set('document')} /></Field>
        <Field label="E-mail"><input type="email" className={inputCls} value={form.email} onChange={set('email')} /></Field>
        <Field label="Telefone"><input className={inputCls} value={form.phone} onChange={set('phone')} /></Field>
        <Field label="WhatsApp"><input className={inputCls} value={form.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Cidade"><input className={inputCls} value={form.city} onChange={set('city')} /></Field>
        <Field label="Estado">
          <select className={inputCls} value={form.state} onChange={set('state')}>
            <option value="">—</option>
            {BRAZIL_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Observações"><textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
};

interface Props {
  ctl: WholesaleController;
  color: string;
  isAdmin: boolean;
  onMessage: (text: string, kind?: 'ok' | 'error') => void;
}

export const WholesaleCustomers: React.FC<Props> = ({ ctl, color, isAdmin, onMessage }) => {
  const { customers } = ctl.data;
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<WholesaleCustomer | 'new' | null>(null);
  const [removing, setRemoving] = useState<WholesaleCustomer | null>(null);

  const list = customers.filter(c => {
    const t = term.trim().toLowerCase();
    return !t || [c.name, c.company, c.document, c.phone, c.city].some(v => (v || '').toLowerCase().includes(t));
  });

  const save = async (input: CustomerInput): Promise<string | null> => {
    const res = await ctl.run(() => ctl.repo.saveCustomer(input));
    if (!res.ok) return res.error;
    setEditing(null);
    onMessage(input.id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    return null;
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const res = await ctl.run(() => ctl.repo.deleteCustomer(removing.id));
    if (!res.ok) return onMessage(res.error, 'error');
    setRemoving(null);
    onMessage('Cliente excluído. As vendas dele continuam no histórico.');
  };

  const whatsappLink = (c: WholesaleCustomer) => {
    const digits = (c.whatsapp || c.phone || '').replace(/\D/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits.length <= 11 ? '55' + digits : digits}`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Buscar por nome, empresa, documento ou cidade"
            className={`${inputCls} pl-9`} />
        </div>
        <button type="button" className={btnPrimary} style={{ backgroundColor: color }} onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> Novo cliente
        </button>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={Users} text={customers.length === 0 ? 'Nenhum cliente cadastrado no Atacado.' : 'Nenhum cliente encontrado.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Cidade/UF</th>
                  <th className="px-4 py-3 text-right">Total comprado</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => {
                  const wa = whatsappLink(c);
                  return (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800 block">{c.name}</span>
                        <span className="text-[11px] text-slate-400">{[c.company, c.document].filter(Boolean).join(' · ') || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.phone || c.whatsapp || '—'}
                        {c.email && <span className="block text-[11px] text-slate-400">{c.email}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{[c.city, c.state].filter(Boolean).join('/') || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatBRL(c.total_purchased)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.purchases_count}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(c.last_purchase_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${c.name}`}
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"><MessageCircle className="w-4 h-4" /></a>
                          )}
                          {isAdmin && (
                            <>
                              <button type="button" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}
                                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
                              <button type="button" aria-label={`Excluir ${c.name}`} onClick={() => setRemoving(c)}
                                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <CustomerFormModal
          initial={editing === 'new' ? undefined : editing}
          color={color}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      {removing && (
        <Modal
          title="Excluir cliente"
          onClose={() => setRemoving(null)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setRemoving(null)}>Cancelar</button>
            <button type="button" className={btnDanger} onClick={confirmRemove}>Excluir</button>
          </>}
        >
          <p className="text-sm text-slate-600">Excluir <strong>{removing.name}</strong>? O histórico de vendas é mantido.</p>
        </Modal>
      )}
    </div>
  );
};
