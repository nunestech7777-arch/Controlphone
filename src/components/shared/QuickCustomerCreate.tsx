// ============================================================================
// CONTROLPHONE — CADASTRO RÁPIDO DE CLIENTE DURANTE A VENDA / UPGRADE
// ============================================================================

import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { SALES_ORIGINS } from '../../lib/salesOrigins';

interface QuickCustomerCreateProps {
  tenantId: string;
  onCreated: (customerId: string) => void;
}

export const QuickCustomerCreate: React.FC<QuickCustomerCreateProps> = ({ tenantId, onCreated }) => {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const result = store.saveCustomer({
      tenantId, userId: currentUser.id, data: { name, phone, cpf, origin }, origin: 'cadastro rápido na venda'
    });
    if (!result.ok || !result.data) {
      setError(result.error || 'Não foi possível cadastrar o cliente.');
      return;
    }
    onCreated(result.data.id);
    setOpen(false);
    setName(''); setPhone(''); setCpf(''); setOrigin(''); setError('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1.5"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Cadastrar novo cliente
      </button>
    );
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs';

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Novo cliente</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input type="text" placeholder="Nome completo *" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <input type="text" placeholder="Telefone / WhatsApp *" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        <input type="text" placeholder="CPF (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} className={inputCls} />
        <select aria-label="Origem do Cliente" value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">Origem do cliente (opcional)</option>
          {SALES_ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
          Cancelar
        </button>
        <button type="button" onClick={handleSave} className="btn-tenant-primary px-4 py-1.5 font-bold rounded-xl">
          Salvar e selecionar
        </button>
      </div>
    </div>
  );
};
