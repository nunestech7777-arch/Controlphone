// ============================================================================
// CONTROLPHONE — ESTOQUE DE ACESSÓRIOS & BRINDES COM CUSTO ABSORVIDO
// ============================================================================

import React, { useState } from 'react';
import { Package, Gift as GiftIcon, Plus, Search, X } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Accessory, Gift } from '../../types';
import { formatBRL } from '../../lib/labels';

export const InventoryAccessories: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const features = store.getTenantFeatures(tenantId);
  const [tab, setTab] = useState<'accessories' | 'gifts'>(features.accessories ? 'accessories' : 'gifts');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const accessories = store.accessories.filter(a => a.tenant_id === tenantId);
  const gifts = store.gifts.filter(g => g.tenant_id === tenantId);
  const suppliers = store.suppliers.filter(s => s.tenant_id === tenantId);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || !unitCost) return;

    let itemId: string;
    if (tab === 'accessories') {
      const newAcc: Accessory = {
        id: 'acc-' + Date.now(),
        tenant_id: tenantId,
        name,
        category,
        quantity: parseInt(quantity) || 0,
        unit_cost: parseFloat(unitCost),
        sale_price: parseFloat(salePrice) || 0,
        supplier_id: supplierId || undefined,
        created_at: new Date().toISOString()
      };
      store.accessories.unshift(newAcc);
      itemId = newAcc.id;
    } else {
      const newGift: Gift = {
        id: 'gift-' + Date.now(),
        tenant_id: tenantId,
        name,
        category,
        quantity: parseInt(quantity) || 0,
        unit_cost: parseFloat(unitCost),
        supplier_id: supplierId || undefined,
        created_at: new Date().toISOString()
      };
      store.gifts.unshift(newGift);
      itemId = newGift.id;
    }

    if (supplierId) {
      store.recordSupplierPurchase({
        tenant_id: tenantId,
        supplier_id: supplierId,
        item_type: tab === 'accessories' ? 'accessory' : 'gift',
        item_id: itemId,
        description: name,
        quantity: parseInt(quantity) || 0,
        unit_cost: parseFloat(unitCost),
        purchased_at: new Date().toISOString()
      });
    }

    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: currentUser.role,
      action: tab === 'accessories' ? 'ACESSORIO_CADASTRADO' : 'BRINDE_CADASTRADO',
      module: 'Estoque Acessórios',
      record_id: name,
      details: { nome: name, qtd: quantity, custo: unitCost, fornecedor: store.getSupplierName(supplierId || undefined) }
    });

    store.saveToStorage();
    setIsModalOpen(false);
    setName('');
    setCategory('');
    setQuantity('10');
    setUnitCost('');
    setSalePrice('');
    setSupplierId('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Estoque de Acessórios & Brindes Cortesia
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Brindes são concedidos de graça na venda, e o custo de cada um é descontado do resultado da loja.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          {tab === 'accessories' ? 'Cadastrar Acessório' : 'Cadastrar Brinde'}
        </button>
      </div>

      {/* TABS & BUSCA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
          {features.accessories && (
          <button
            onClick={() => setTab('accessories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === 'accessories'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Acessórios ({accessories.length})
          </button>
          )}
          {features.gifts && (
          <button
            onClick={() => setTab('gifts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              tab === 'gifts'
                ? 'bg-tenant-action text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GiftIcon className="w-3.5 h-3.5" />
            Brindes Cortesia ({gifts.length})
          </button>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou categoria..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>
      </div>

      {/* TABELA DE ITENS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Item / Nome</th>
                <th className="py-3.5 px-4">Categoria</th>
                <th className="py-3.5 px-4">Fornecedor</th>
                <th className="py-3.5 px-4">Quantidade em Estoque</th>
                <th className="py-3.5 px-4">Custo Unitário (Loja)</th>
                {tab === 'accessories' && <th className="py-3.5 px-4">Preço de Venda</th>}
                {tab === 'gifts' && <th className="py-3.5 px-4">Valor Cobrado ao Cliente</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tab === 'accessories' &&
                accessories
                  .filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800">{acc.name}</td>
                      <td className="py-3.5 px-4 text-slate-600">{acc.category}</td>
                      <td className={`py-3.5 px-4 ${acc.supplier_id ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
                        {store.getSupplierName(acc.supplier_id)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className={`px-2.5 py-1 rounded-full text-xs ${
                          acc.quantity > 5 ? 'bg-slate-100 text-slate-800' : 'bg-rose-50 text-rose-700 font-extrabold'
                        }`}>
                          {acc.quantity} un.
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {formatBRL(Number(acc.unit_cost))}
                      </td>
                      <td className="py-3.5 px-4 font-black text-blue-600">
                        {formatBRL(Number(acc.sale_price))}
                      </td>
                    </tr>
                  ))}

              {tab === 'gifts' &&
                gifts
                  .filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((gift) => (
                    <tr key={gift.id} className="hover:bg-purple-50/20 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-purple-900 flex items-center gap-2">
                        <GiftIcon className="w-3.5 h-3.5 text-purple-600" />
                        {gift.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{gift.category}</td>
                      <td className={`py-3.5 px-4 ${gift.supplier_id ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
                        {store.getSupplierName(gift.supplier_id)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="px-2.5 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                          {gift.quantity} disponíveis
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {formatBRL(Number(gift.unit_cost))} (Custo da loja)
                      </td>
                      <td className="py-3.5 px-4 font-black text-emerald-600">
                        R$ 0,00 (Gratuito)
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CADASTRO */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">
                {tab === 'accessories' ? 'Cadastrar Novo Acessório' : 'Cadastrar Novo Brinde'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome do Item *</label>
                <input
                  type="text"
                  placeholder="Ex: Carregador Rápido 20W / Película 9D"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Categoria *</label>
                  <input
                    type="text"
                    placeholder="Ex: Cabos / Capas"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantidade Inicial *</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo Unitário (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
                {tab === 'accessories' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Preço Venda (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold text-blue-600"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Fornecedor</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Não informado</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}{sup.company_name ? ` (${sup.company_name})` : ''}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nenhum fornecedor cadastrado. Cadastre no módulo Fornecedores para vincular.
                  </p>
                )}
              </div>

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
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
