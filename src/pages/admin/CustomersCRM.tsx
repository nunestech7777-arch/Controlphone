// ============================================================================
// CONTROLPHONE — CLIENTES (CRM) COM ANIVERSARIANTES & WHATSAPP
// ============================================================================

import React, { useState } from 'react';
import { Users, Search, Plus, Cake, MessageCircle, Phone, Mail, Calendar, X } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Customer } from '../../types';
import { CustomerProfileModal } from './CustomerProfileModal';
import { consumeIntent } from '../../lib/navIntent';
import { isValidCPF, maskCPF, maskPhone } from '../../lib/tenantSetup';
import { formatBRL } from '../../lib/labels';

export const CustomersCRM: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterBirthdays, setFilterBirthdays] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(
    () => consumeIntent('admin-customers', 'view-customer')?.customerId || null
  );

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const customers = store.customers.filter(c => c.tenant_id === tenantId);

  // Aniversariantes do mês atual (Outubro = 10)
  const currentMonth = new Date().getMonth() + 1;
  const birthdayCustomers = customers.filter(c => {
    if (!c.birth_date) return false;
    const [, month] = c.birth_date.split('-');
    return parseInt(month) === currentMonth;
  });

  const filteredCustomers = (filterBirthdays ? birthdayCustomers : customers).filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    (c.cpf && c.cpf.includes(searchTerm))
  );

  const resetForm = () => {
    setEditingId(null);
    setName(''); setPhone(''); setWhatsapp(''); setEmail(''); setCpf(''); setBirthDate(''); setAddress('');
    setFormError('');
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (cust: Customer) => {
    setEditingId(cust.id);
    setName(cust.name);
    setPhone(cust.phone);
    setWhatsapp(cust.whatsapp || '');
    setEmail(cust.email || '');
    setCpf(cust.cpf || '');
    setBirthDate(cust.birth_date || '');
    setAddress(cust.address || '');
    setFormError('');
    setProfileId(null);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (cpf.trim() && !isValidCPF(cpf)) {
      setFormError('CPF inválido. Confira os números ou deixe o campo em branco.');
      return;
    }
    const digits = cpf.replace(/\D/g, '');
    const duplicate = digits && customers.find(c => c.id !== editingId && (c.cpf || '').replace(/\D/g, '') === digits);
    if (duplicate) {
      setFormError(`Já existe um cliente com este CPF: ${duplicate.name}.`);
      return;
    }
    const result = store.saveCustomer({
      tenantId, userId: currentUser.id, customerId: editingId || undefined,
      data: { name, phone, whatsapp, email, cpf, birth_date: birthDate, address }
    });
    if (!result.ok) {
      setFormError(result.error || 'Não foi possível salvar o cliente.');
      return;
    }
    setIsModalOpen(false);
    resetForm();
  };

  const openWhatsApp = (phoneNum: string, clientName: string) => {
    const cleanNum = phoneNum.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá ${clientName}, tudo bem? Aqui é da ${currentTenant?.trade_name || 'loja'}!`);
    window.open(`https://wa.me/55${cleanNum}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Clientes
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Histórico completo de compras, ordens de serviço e acompanhamento de aniversariantes.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      {/* FILTRO RÁPIDO DE ANIVERSARIANTES */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterBirthdays(false)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              !filterBirthdays ? 'bg-[#0B0F17] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos os Clientes ({customers.length})
          </button>
          <button
            onClick={() => setFilterBirthdays(true)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterBirthdays ? 'bg-tenant-action text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Cake className="w-3.5 h-3.5" />
            Aniversariantes do Mês ({birthdayCustomers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nome, Telefone ou CPF..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>
      </div>

      {/* TABELA DE CLIENTES */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nome do Cliente</th>
                <th className="py-3.5 px-4">Telefone / WhatsApp</th>
                <th className="py-3.5 px-4">E-mail</th>
                <th className="py-3.5 px-4">Aniversário</th>
                <th className="py-3.5 px-4">Total Gasto na Loja</th>
                <th className="py-3.5 px-4 text-right">Contato Rápido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((cust) => {
                const totalSpent = store.sales
                  .filter(s => s.customer_id === cust.id && s.status === 'completed')
                  .reduce((acc, s) => acc + Number(s.total_amount), 0);

                return (
                  <tr
                    key={cust.id}
                    onClick={() => setProfileId(cust.id)}
                    title="Abrir cadastro do cliente"
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      <div>{cust.name}</div>
                      {cust.cpf && <span className="text-[10px] text-slate-400 font-normal">CPF: {cust.cpf}</span>}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {cust.phone}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {cust.email || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {cust.birth_date ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 text-[11px]">
                          <Cake className="w-3 h-3 text-purple-600" />
                          {cust.birth_date.split('-').reverse().slice(0, 2).join('/')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">
                      {formatBRL(totalSpent)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); openWhatsApp(cust.whatsapp || cust.phone, cust.name); }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PERFIL DO CLIENTE: DADOS | GARANTIAS | HISTÓRICO */}
      {profileId && customers.find(c => c.id === profileId) && (
        <CustomerProfileModal
          customer={customers.find(c => c.id === profileId) as Customer}
          onClose={() => setProfileId(null)}
          onEdit={openEdit}
        />
      )}

      {/* MODAL DE CADASTRO */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                {editingId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  placeholder="Nome do cliente"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Telefone Principal *</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Data de Nascimento</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">CPF</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Rua, Número, Bairro, Cidade..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {formError && <p className="text-[11px] font-semibold text-rose-600">{formError}</p>}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl"
                >
                  {editingId ? 'Salvar Alterações' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
