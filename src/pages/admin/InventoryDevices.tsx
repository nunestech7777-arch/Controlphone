// ============================================================================
// CONTROLPHONE — ESTOQUE DE APARELHOS COM RASTREABILIDADE POR IMEI
// ============================================================================

import React, { useState } from 'react';
import { Smartphone, Plus, Search, Battery, Eye, Pencil, X, ArrowUp, ArrowDown, ArrowUpDown, Wrench, DollarSign } from 'lucide-react';
import { store, normalizeImei, isValidImei, newUuid, IMEI_HINT } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Device } from '../../types';
import { MetricCard } from '../../components/shared/MetricCard';
import { computeStockMetrics, formatBRL, pendingStockNote } from '../../lib/stockMetrics';

// Dias corridos entre duas datas, pela data local da loja (evita deslocamento por fuso/horário)
const calendarDay = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

// Dias corridos desde a entrada ORIGINAL do aparelho (a manutenção interna não reinicia a contagem)
const getDaysInStock = (dev: Device): number => {
  const end = calendarDay(new Date().toISOString());
  return Math.max(0, Math.round((end - calendarDay(dev.entry_date)) / 86400000));
};

const getDaysBadgeClass = (days: number) => {
  if (days <= 15) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (days <= 30) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (days <= 60) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
};

export const InventoryDevices: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [daysSort, setDaysSort] = useState<'asc' | 'desc' | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [detailDeviceId, setDetailDeviceId] = useState<string | null>(null);
  const [assistanceDeviceId, setAssistanceDeviceId] = useState<string | null>(null);
  const [assistanceDefect, setAssistanceDefect] = useState('');
  const [assistanceNotes, setAssistanceNotes] = useState('');
  const [assistanceError, setAssistanceError] = useState('');

  // Form State
  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('128GB');
  const [color, setColor] = useState('');
  const [imei, setImei] = useState('');
  const [batteryHealth, setBatteryHealth] = useState<string>('95');
  const [supplierId, setSupplierId] = useState<string>('');
  const [acquisitionCost, setAcquisitionCost] = useState<string>('');
  const [suggestedPrice, setSuggestedPrice] = useState<string>('');
  const [notes, setNotes] = useState('');

  // O estoque exibe SOMENTE aparelhos disponíveis para venda
  const allDevices = store.devices.filter(d => d.tenant_id === tenantId);
  const devices = allDevices.filter(d => d.status === 'available');
  const suppliers = store.suppliers.filter(s => s.tenant_id === tenantId);
  const stockMetrics = computeStockMetrics(tenantId);
  const detailDevice = devices.find(d => d.id === detailDeviceId);
  const assistanceDevice = devices.find(d => d.id === assistanceDeviceId);

  const filteredDevices = devices.filter(d => {
    const term = searchTerm.toLowerCase();
    return (
      d.model.toLowerCase().includes(term) ||
      d.imei.includes(searchTerm.trim()) ||
      d.color.toLowerCase().includes(term) ||
      store.getSupplierName(d.supplier_id).toLowerCase().includes(term)
    );
  });

  const sortedDevices = daysSort
    ? [...filteredDevices].sort((a, b) => {
        const da = getDaysInStock(a);
        const db = getDaysInStock(b);
        return daysSort === 'asc' ? da - db : db - da;
      })
    : filteredDevices;

  const toggleDaysSort = () =>
    setDaysSort(prev => (prev === null ? 'desc' : prev === 'desc' ? 'asc' : null));

  const resetForm = () => {
    setBrand('Apple');
    setModel('');
    setStorage('128GB');
    setColor('');
    setImei('');
    setBatteryHealth('95');
    setSupplierId('');
    setAcquisitionCost('');
    setSuggestedPrice('');
    setNotes('');
  };

  const openCreateModal = () => {
    resetForm();
    setEditingDeviceId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (dev: Device) => {
    setBrand(dev.brand);
    setModel(dev.model);
    setStorage(dev.storage_capacity);
    setColor(dev.color);
    setImei(dev.imei);
    setBatteryHealth(dev.battery_health ? String(dev.battery_health) : '');
    setSupplierId(dev.supplier_id || '');
    setAcquisitionCost(String(dev.acquisition_cost));
    setSuggestedPrice(String(dev.suggested_price));
    setNotes(dev.physical_condition_notes || '');
    setEditingDeviceId(dev.id);
    setDetailDeviceId(null);
    setIsModalOpen(true);
  };

  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !imei || !acquisitionCost || !suggestedPrice) {
      alert('Preencha os campos obrigatórios!');
      return;
    }

    // Verificar se o IMEI já existe na loja
    if (!isValidImei(imei)) {
      alert(`IMEI inválido. ${IMEI_HINT}`);
      return;
    }
    const cleanImei = normalizeImei(imei);
    const cost = parseFloat(acquisitionCost);
    const price = parseFloat(suggestedPrice);
    if (!(cost >= 0) || !(price > 0)) {
      alert('Informe um custo de aquisição válido e um preço sugerido maior que zero.');
      return;
    }

    // Aparelho que a loja já vendeu (ou baixou) pode ser comprado de novo: o mesmo cadastro é reaproveitado
    const existing = store.findDeviceByImei(tenantId, cleanImei, editingDeviceId || undefined);
    const reentry = !editingDeviceId && existing && (existing.status === 'sold' || existing.status === 'decommissioned')
      ? existing
      : undefined;
    if (existing && !reentry) {
      alert('Já existe um aparelho cadastrado com este IMEI nesta loja!');
      return;
    }

    const formData = {
      imei: cleanImei,
      brand,
      model,
      storage_capacity: storage,
      color,
      battery_health: parseInt(batteryHealth) || undefined,
      physical_condition_notes: notes,
      supplier_id: supplierId || undefined,
      acquisition_cost: parseFloat(acquisitionCost),
      suggested_price: parseFloat(suggestedPrice)
    };

    const editing = allDevices.find(d => d.id === editingDeviceId);
    let saved: Device;
    if (editing) {
      Object.assign(editing, formData);
      saved = editing;
    } else if (reentry) {
      store.closeWarrantiesForDevice(reentry.id, 'Aparelho recomprado pela loja', currentUser.id);
      Object.assign(reentry, formData, {
        origin: 'purchase', origin_trade_in_id: undefined, accumulated_repair_cost: 0,
        status: 'available', sold_at: undefined, entry_date: new Date().toISOString()
      });
      saved = reentry;
      store.recordMovement({
        tenant_id: tenantId, device_id: saved.id, imei: saved.imei,
        movement_type: 'stock_entry', description: 'Aparelho já vendido pela loja foi recomprado e reentrou no estoque',
        to_status: 'available', cost: saved.acquisition_cost, user_id: currentUser.id
      });
    } else {
      saved = {
        ...formData,
        id: newUuid(),
        tenant_id: tenantId,
        origin: 'purchase',
        accumulated_repair_cost: 0,
        status: 'available',
        entry_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      store.devices.unshift(saved);
      store.recordMovement({
        tenant_id: tenantId, device_id: saved.id, imei: saved.imei,
        movement_type: 'stock_entry', description: 'Aparelho cadastrado no estoque',
        to_status: 'available', cost: saved.acquisition_cost, user_id: currentUser.id
      });
    }

    store.syncDevicePurchase(saved);
    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: currentUser.role,
      action: editing ? 'APARELHO_EDITADO' : 'APARELHO_CADASTRADO',
      module: 'Estoque Aparelhos',
      record_id: saved.id,
      details: {
        imei,
        modelo: `${brand} ${model} ${storage}`,
        custo: parseFloat(acquisitionCost),
        fornecedor: store.getSupplierName(saved.supplier_id)
      }
    });
    store.saveToStorage();

    setIsModalOpen(false);
    setEditingDeviceId(null);
    resetForm();
  };

  const openAssistanceModal = (dev: Device) => {
    setAssistanceDeviceId(dev.id);
    setAssistanceDefect('');
    setAssistanceNotes('');
    setAssistanceError('');
    setDetailDeviceId(null);
  };

  const handleSendToAssistance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistanceDevice) return;

    const result = store.sendDeviceToAssistance({
      tenantId,
      deviceId: assistanceDevice.id,
      userId: currentUser.id,
      userRole: currentUser.role,
      defect: assistanceDefect,
      notes: assistanceNotes
    });

    if (!result.ok) {
      setAssistanceError(result.error || 'Não foi possível enviar o aparelho para a assistência.');
      return;
    }
    setAssistanceDeviceId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-600" />
            Estoque de Aparelhos (Rastreabilidade por IMEI)
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Aparelhos disponíveis para venda, com fornecedor, custo acumulado e tempo em estoque.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Aparelho
        </button>
      </div>

      {/* VISÃO FINANCEIRA DO ESTOQUE DISPONÍVEL (mesmo card e mesmos cálculos do Dashboard) */}
      <MetricCard
        title="Valor Total do Estoque"
        value={formatBRL(stockMetrics.stockSaleValue)}
        icon={DollarSign}
        variant="primary"
        layout="inline"
        details={[
          { label: 'Capital Investido', value: formatBRL(stockMetrics.investedCapital) },
          { label: 'Lucro Potencial', value: formatBRL(stockMetrics.potentialProfit) }
        ]}
        note={pendingStockNote(stockMetrics.pendingDevices)}
      />

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Modelo, IMEI, Cor ou Fornecedor..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {filteredDevices.length} {filteredDevices.length === 1 ? 'aparelho disponível' : 'aparelhos disponíveis'}
        </span>
      </div>

      {/* TABELA DE APARELHOS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Aparelho / Modelo</th>
                <th className="py-3.5 px-4 whitespace-nowrap">IMEI Único</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Fornecedor</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Origem</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Custo Aquisição</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Custo Acumulado</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Preço Sugerido</th>
                <th
                  className="py-3.5 px-4 whitespace-nowrap text-center"
                  aria-sort={daysSort === 'asc' ? 'ascending' : daysSort === 'desc' ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    onClick={toggleDaysSort}
                    title="Ordenar por dias em estoque"
                    className="inline-flex items-center gap-1 uppercase tracking-wider font-bold hover:text-slate-700 transition-colors"
                  >
                    Dias em Estoque
                    {daysSort === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-slate-700" />
                    ) : daysSort === 'desc' ? (
                      <ArrowDown className="w-3 h-3 text-slate-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 pl-2 pr-4 w-10"><span className="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDevices.map((dev) => {
                const totalAccumulatedCost = Number(dev.acquisition_cost) + Number(dev.accumulated_repair_cost);
                const supplierName = store.getSupplierName(dev.supplier_id);
                const daysInStock = getDaysInStock(dev);
                return (
                  <tr
                    key={dev.id}
                    onClick={() => setDetailDeviceId(dev.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800 whitespace-nowrap">{dev.brand} {dev.model}</div>
                      <div className="text-[11px] text-slate-500 whitespace-nowrap">{dev.storage_capacity} - {dev.color}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {dev.imei}
                    </td>
                    <td className="py-3.5 px-4">
                      <div
                        title={supplierName}
                        className={`max-w-[180px] truncate ${
                          dev.supplier_id && supplierName !== 'Não informado'
                            ? 'font-medium text-slate-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {supplierName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        dev.origin === 'trade_in' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {dev.origin === 'trade_in' ? 'Upgrade' : 'Compra'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap text-right">
                      {formatBRL(Number(dev.acquisition_cost))}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap text-right">
                      {formatBRL(totalAccumulatedCost)}
                      {dev.accumulated_repair_cost > 0 && (
                        <span className="block text-[10px] text-amber-600 font-normal">
                          (+{formatBRL(Number(dev.accumulated_repair_cost))} reparo)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-blue-600 whitespace-nowrap text-right">
                      {formatBRL(Number(dev.suggested_price))}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${getDaysBadgeClass(daysInStock)}`}>
                        {daysInStock} {daysInStock === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                    <td className="py-3.5 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        title="Ver detalhes do aparelho"
                        aria-label="Ver detalhes do aparelho"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhum aparelho disponível encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DETALHES DO APARELHO */}
      {detailDevice && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="truncate">{detailDevice.brand} {detailDevice.model}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {detailDevice.storage_capacity} - {detailDevice.color}
                </p>
              </div>
              <button onClick={() => setDetailDeviceId(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">IMEI</span>
                  <span className="font-mono font-semibold text-slate-800">{detailDevice.imei}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Fornecedor</span>
                  <span className="font-semibold text-slate-800">{store.getSupplierName(detailDevice.supplier_id)}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Saúde da Bateria</span>
                  {detailDevice.battery_health ? (
                    <div className="flex items-center gap-2">
                      <Battery className={`w-4 h-4 ${detailDevice.battery_health >= 85 ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <span className={`font-bold ${detailDevice.battery_health >= 85 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {detailDevice.battery_health}%
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${detailDevice.battery_health >= 85 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.min(detailDevice.battery_health, 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">Não informado</span>
                  )}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Origem</span>
                  <span className="font-semibold text-slate-800">{detailDevice.origin === 'trade_in' ? 'Upgrade (Troca)' : 'Compra'}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Data de Entrada</span>
                  <span className="font-semibold text-slate-800">{new Date(detailDevice.entry_date).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-3 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Custo Aquisição</span>
                  <span className="font-semibold text-slate-700">{formatBRL(Number(detailDevice.acquisition_cost))}</span>
                </div>
                <div className="rounded-xl p-3 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Custo Acumulado</span>
                  <span className="font-bold text-slate-900">
                    {formatBRL(Number(detailDevice.acquisition_cost) + Number(detailDevice.accumulated_repair_cost))}
                  </span>
                </div>
                <div className="rounded-xl p-3 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Preço Sugerido</span>
                  <span className="font-black text-blue-600">{formatBRL(Number(detailDevice.suggested_price))}</span>
                </div>
              </div>

              {detailDevice.physical_condition_notes && (
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observações</span>
                  <p className="text-slate-600 leading-relaxed">{detailDevice.physical_condition_notes}</p>
                </div>
              )}

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Histórico de Movimentações</span>
                <ol className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {store.getDeviceMovements(detailDevice.id).map((mov) => (
                    <li key={mov.id} className="flex items-start gap-3 text-[11px]">
                      <span className="font-mono text-slate-400 shrink-0 w-[92px]">
                        {new Date(mov.created_at).toLocaleDateString('pt-BR')}{' '}
                        {new Date(mov.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-slate-700 min-w-0">
                        {mov.description}
                        {mov.user_name && <span className="text-slate-400"> — {mov.user_name}</span>}
                      </span>
                    </li>
                  ))}
                  {store.getDeviceMovements(detailDevice.id).length === 0 && (
                    <li className="text-[11px] text-slate-400">Nenhuma movimentação registrada.</li>
                  )}
                </ol>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDetailDeviceId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => openAssistanceModal(detailDevice)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Enviar para Assistência
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(detailDevice)}
                  className="btn-tenant-primary px-5 py-2 rounded-xl font-bold flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar Aparelho
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ENVIO PARA ASSISTÊNCIA INTERNA */}
      {assistanceDevice && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-600" />
                Enviar para Assistência
              </h3>
              <button onClick={() => setAssistanceDeviceId(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4 text-xs space-y-1">
              <div className="font-bold text-slate-800">
                {assistanceDevice.brand} {assistanceDevice.model}
              </div>
              <div className="text-slate-500">
                {assistanceDevice.storage_capacity} - {assistanceDevice.color}
              </div>
              <div className="font-mono text-slate-600">IMEI {assistanceDevice.imei}</div>
              <div className="pt-1 mt-1 border-t border-slate-200 text-slate-600">
                Origem: <span className="font-semibold text-slate-800">Estoque da Loja</span> | Data de envio:{' '}
                <span className="font-semibold text-slate-800">{new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <form onSubmit={handleSendToAssistance} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Defeito Apresentado *</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Bateria com saúde baixa, troca de tela..."
                  value={assistanceDefect}
                  onChange={(e) => setAssistanceDefect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={assistanceNotes}
                  onChange={(e) => setAssistanceNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                O aparelho sairá do estoque disponível e aparecerá na Assistência Interna. Ao concluir o reparo, ele
                retorna ao estoque com o mesmo IMEI, fornecedor, data de entrada e o custo da manutenção somado.
              </p>

              {assistanceError && (
                <p className="text-[11px] font-semibold text-rose-600">{assistanceError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssistanceDeviceId(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Confirmar Envio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE APARELHO */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                {editingDeviceId ? 'Editar Aparelho' : 'Cadastrar Novo Aparelho'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Marca *</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Modelo *</label>
                  <input
                    type="text"
                    placeholder="Ex: iPhone 15 Pro Max"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Armazenamento *</label>
                  <select
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cor *</label>
                  <input
                    type="text"
                    placeholder="Ex: Titânio Preto"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Saúde Bateria (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={batteryHealth}
                    onChange={(e) => setBatteryHealth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Número do IMEI (Obrigatório & Único) *</label>
                <input
                  type="text"
                  placeholder="Ex: 354892091823712"
                  inputMode="numeric"
                  maxLength={15}
                  value={imei}
                  onChange={(e) => setImei(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo de Aquisição (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={acquisitionCost}
                    onChange={(e) => setAcquisitionCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Preço Sugerido de Venda (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={suggestedPrice}
                    onChange={(e) => setSuggestedPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold text-blue-600"
                    required
                  />
                </div>
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

              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Tela quebrada, tampa com riscos, Face ID inoperante, aparelho impecável..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 rounded-xl font-bold"
                >
                  {editingDeviceId ? 'Salvar Alterações' : 'Salvar Aparelho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
