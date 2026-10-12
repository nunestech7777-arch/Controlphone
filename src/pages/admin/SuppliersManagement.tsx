// ============================================================================
// CONTROLPHONE — FORNECEDORES COM HISTÓRICO DE COMPRAS
// ============================================================================

import React, { useState } from 'react';
import {
  Truck, Plus, Search, X, Eye, Pencil, Trash2, ArrowLeft, MessageCircle,
  Phone, Mail, MapPin, FileText, Building2, AlertTriangle
} from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Supplier, SupplierPurchaseItemType } from '../../types';

const emptyForm = {
  name: '',
  company_name: '',
  phone: '',
  whatsapp: '',
  email: '',
  cpf_cnpj: '',
  address: '',
  notes: ''
};

const itemTypeLabels: Record<SupplierPurchaseItemType, string> = {
  device: 'Aparelho',
  accessory: 'Acessório',
  gift: 'Brinde'
};

const itemTypeBadges: Record<SupplierPurchaseItemType, string> = {
  device: 'bg-blue-50 text-blue-700',
  accessory: 'bg-slate-100 text-slate-700',
  gift: 'bg-purple-100 text-purple-700'
};

export const SuppliersManagement: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | SupplierPurchaseItemType>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const suppliers = store.suppliers.filter(s => s.tenant_id === tenantId);
  const purchases = store.supplierPurchases.filter(p => p.tenant_id === tenantId);
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const deletingSupplier = suppliers.find(s => s.id === deletingSupplierId);

  const purchasesOf = (supplierId: string) =>
    purchases
      .filter(p => p.supplier_id === supplierId)
      .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));

  const filteredSuppliers = suppliers.filter(s => {
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.company_name || '').toLowerCase().includes(term) ||
      s.phone.includes(searchTerm) ||
      (s.cpf_cnpj || '').includes(searchTerm)
    );
  });

  const setField = (field: keyof typeof emptyForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingSupplierId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (sup: Supplier) => {
    setForm({
      name: sup.name,
      company_name: sup.company_name || '',
      phone: sup.phone,
      whatsapp: sup.whatsapp || '',
      email: sup.email || '',
      cpf_cnpj: sup.cpf_cnpj || '',
      address: sup.address || '',
      notes: sup.notes || ''
    });
    setEditingSupplierId(sup.id);
    setIsModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;

    const data = {
      name: form.name.trim(),
      company_name: form.company_name.trim() || undefined,
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      email: form.email.trim() || undefined,
      cpf_cnpj: form.cpf_cnpj.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined
    };

    const editing = suppliers.find(s => s.id === editingSupplierId);
    let recordId: string;
    if (editing) {
      Object.assign(editing, data);
      recordId = editing.id;
    } else {
      const newSupplier: Supplier = {
        ...data,
        id: 'sup-' + Date.now(),
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      };
      store.suppliers.unshift(newSupplier);
      recordId = newSupplier.id;
    }

    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: currentUser.role,
      action: editing ? 'FORNECEDOR_EDITADO' : 'FORNECEDOR_CADASTRADO',
      module: 'Fornecedores',
      record_id: recordId,
      details: { nome: data.name, empresa: data.company_name, telefone: data.phone }
    });
    store.saveToStorage();

    setIsModalOpen(false);
    setEditingSupplierId(null);
    setForm(emptyForm);
  };

  const handleDeleteSupplier = () => {
    if (!deletingSupplier) return;
    const removedPurchases = purchasesOf(deletingSupplier.id).length;

    store.deleteSupplier(deletingSupplier.id);
    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: currentUser.role,
      action: 'FORNECEDOR_EXCLUIDO',
      module: 'Fornecedores',
      record_id: deletingSupplier.id,
      details: { nome: deletingSupplier.name, compras_removidas: removedPurchases }
    });
    store.saveToStorage();

    if (selectedSupplierId === deletingSupplier.id) setSelectedSupplierId(null);
    setDeletingSupplierId(null);
  };

  const openWhatsApp = (phoneNum: string, supplierName: string) => {
    const cleanNum = phoneNum.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá ${supplierName}, tudo bem? Aqui é da ${currentTenant?.trade_name || 'loja'}!`);
    window.open(`https://wa.me/55${cleanNum}?text=${msg}`, '_blank');
  };

  const renderDetails = (sup: Supplier) => {
    const history = purchasesOf(sup.id);
    const visibleHistory = history.filter(p => historyFilter === 'all' || p.item_type === historyFilter);
    const totalSpent = history.reduce((acc, p) => acc + Number(p.total_cost), 0);
    const totalUnits = history.reduce((acc, p) => acc + Number(p.quantity), 0);
    const visibleTotal = visibleHistory.reduce((acc, p) => acc + Number(p.total_cost), 0);

    const infoRows = [
      { icon: Building2, label: 'Empresa', value: sup.company_name },
      { icon: Phone, label: 'Telefone', value: sup.phone },
      { icon: MessageCircle, label: 'WhatsApp', value: sup.whatsapp },
      { icon: Mail, label: 'E-mail', value: sup.email },
      { icon: FileText, label: 'CPF/CNPJ', value: sup.cpf_cnpj },
      { icon: MapPin, label: 'Endereço', value: sup.address }
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => { setSelectedSupplierId(null); setHistoryFilter('all'); }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para Fornecedores
            </button>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">{sup.name}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Fornecedor cadastrado em {formatDate(sup.created_at)}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openWhatsApp(sup.whatsapp || sup.phone, sup.name)}
              className="px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </button>
            <button
              onClick={() => openEditModal(sup)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </button>
            <button
              onClick={() => setDeletingSupplierId(sup.id)}
              className="px-3 py-2.5 rounded-xl border border-rose-200 bg-white font-bold text-xs text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>

        {/* DADOS CADASTRAIS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2.5 min-w-0">
                <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                  <span className={`block break-words ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                    {value || 'Não informado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {sup.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observações</span>
              <p className="text-slate-600 leading-relaxed whitespace-pre-line">{sup.notes}</p>
            </div>
          )}
        </div>

        {/* RESUMO DE COMPRAS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Total Comprado</span>
            <span className="text-lg font-black text-slate-900">R$ {totalSpent.toFixed(2)}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Compras Registradas</span>
            <span className="text-lg font-black text-slate-900">{history.length}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Unidades Compradas</span>
            <span className="text-lg font-black text-slate-900">{totalUnits}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Última Compra</span>
            <span className="text-lg font-black text-slate-900">
              {history.length > 0 ? formatDate(history[0].purchased_at) : '—'}
            </span>
          </div>
        </div>

        {/* HISTÓRICO DE COMPRAS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold text-slate-800">Histórico de Compras</h3>
          <div className="flex items-center gap-2 overflow-x-auto">
            {(['all', 'device', 'accessory', 'gift'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setHistoryFilter(type)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  historyFilter === type
                    ? 'bg-[#0B0F17] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {type === 'all' ? 'Todos' : type === 'device' ? 'Aparelhos' : type === 'accessory' ? 'Acessórios' : 'Brindes'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 whitespace-nowrap">Data</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Tipo</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Item</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Quantidade</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Valor Unitário</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleHistory.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">{formatDate(p.purchased_at)}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${itemTypeBadges[p.item_type]}`}>
                        {itemTypeLabels[p.item_type]}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{p.description}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap text-right">{p.quantity} un.</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap text-right">
                      R$ {Number(p.unit_cost).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap text-right">
                      R$ {Number(p.total_cost).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {visibleHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                      Nenhuma compra registrada com este fornecedor{historyFilter !== 'all' ? ' nesta categoria' : ''}.
                    </td>
                  </tr>
                )}
              </tbody>
              {visibleHistory.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total exibido
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap text-right">
                      R$ {visibleTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Fornecedores
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Cadastro de fornecedores com histórico de compras de aparelhos, acessórios e brindes.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Novo Fornecedor
        </button>
      </div>

      {/* BUSCA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nome, Empresa, Telefone ou CPF/CNPJ..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'fornecedor' : 'fornecedores'}
        </span>
      </div>

      {/* TABELA DE FORNECEDORES */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Fornecedor</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Telefone / WhatsApp</th>
                <th className="py-3.5 px-4 whitespace-nowrap">E-mail</th>
                <th className="py-3.5 px-4 whitespace-nowrap">CPF/CNPJ</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Compras</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Total Comprado</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.map((sup) => {
                const history = purchasesOf(sup.id);
                const totalSpent = history.reduce((acc, p) => acc + Number(p.total_cost), 0);
                return (
                  <tr
                    key={sup.id}
                    onClick={() => setSelectedSupplierId(sup.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800">{sup.name}</div>
                      {sup.company_name && <div className="text-[11px] text-slate-500">{sup.company_name}</div>}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                      {sup.phone}
                      {sup.whatsapp && sup.whatsapp !== sup.phone && (
                        <span className="block text-[11px] font-normal text-slate-500">{sup.whatsapp}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{sup.email || '—'}</td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{sup.cpf_cnpj || '—'}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap text-right">{history.length}</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap text-right">
                      R$ {totalSpent.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedSupplierId(sup.id)}
                          title="Ver detalhes e histórico"
                          aria-label="Ver detalhes e histórico"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(sup)}
                          title="Editar fornecedor"
                          aria-label="Editar fornecedor"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingSupplierId(sup.id)}
                          title="Excluir fornecedor"
                          aria-label="Excluir fornecedor"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSuppliers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    {suppliers.length === 0
                      ? 'Nenhum fornecedor cadastrado. Clique em "Novo Fornecedor" para começar.'
                      : 'Nenhum fornecedor encontrado com a busca informada.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {selectedSupplier ? renderDetails(selectedSupplier) : renderList()}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                {editingSupplierId ? 'Editar Fornecedor' : 'Cadastrar Novo Fornecedor'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nome *</label>
                  <input
                    type="text"
                    placeholder="Nome do contato ou fornecedor"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Empresa</label>
                  <input
                    type="text"
                    placeholder="Razão social ou nome fantasia"
                    value={form.company_name}
                    onChange={(e) => setField('company_name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Telefone *</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={form.whatsapp}
                    onChange={(e) => setField('whatsapp', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="contato@fornecedor.com"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">CPF/CNPJ</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00 ou 00.000.000/0001-00"
                    value={form.cpf_cnpj}
                    onChange={(e) => setField('cpf_cnpj', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Endereço</label>
                <input
                  type="text"
                  placeholder="Rua, Número, Bairro, Cidade..."
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <textarea
                  rows={3}
                  placeholder="Ex: prazo de entrega, condições de pagamento, pedido mínimo..."
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  {editingSupplierId ? 'Salvar Alterações' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      {deletingSupplier && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in text-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-800">Excluir fornecedor?</h3>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  <span className="font-bold text-slate-800">{deletingSupplier.name}</span> será removido
                  permanentemente.
                  {purchasesOf(deletingSupplier.id).length > 0 && (
                    <> O histórico de {purchasesOf(deletingSupplier.id).length} compra(s) será apagado e os
                    itens do estoque vinculados passarão a exibir "Não informado".</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingSupplierId(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteSupplier}
                className="px-5 py-2 font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
              >
                Excluir Fornecedor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
