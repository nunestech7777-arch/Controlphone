// ============================================================================
// CONTROLPHONE — MANUTENÇÕES INTERNAS DO ESTOQUE (INCORPORAÇÃO DE CUSTO)
// ============================================================================

import React, { useState } from 'react';
import { RefreshCw, Plus, CheckCircle2, Smartphone, Search, X } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { InternalRepair } from '../../types';
import { formatBRL } from '../../lib/labels';

export const InternalRepairsView: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [completeModalRepair, setCompleteModalRepair] = useState<InternalRepair | null>(null);

  // Abertura states
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [issueDescription, setIssueDescription] = useState('');

  // Conclusão states
  const [diagnosis, setDiagnosis] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [repairCost, setRepairCost] = useState('');

  const repairs = store.internalRepairs.filter(r => r.tenant_id === tenantId);
  const storeDevices = store.devices.filter(d => d.tenant_id === tenantId && d.status === 'available');

  const handleOpenRepair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeviceId || !issueDescription) return;

    const result = store.createInternalRepair({
      tenantId,
      deviceId: selectedDeviceId,
      technicianId: currentUser.id,
      issueDescription
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }

    alert('Manutenção interna aberta! O aparelho saiu do estoque e está na Assistência Interna.');
    setIsModalOpen(false);
    setSelectedDeviceId('');
    setIssueDescription('');
  };

  const handleCompleteRepair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModalRepair || !repairCost) return;

    const result = store.completeInternalRepair({
      tenantId,
      repairId: completeModalRepair.id,
      technicianId: currentUser.id,
      diagnosis,
      partsUsed,
      repairCost: parseFloat(repairCost) || 0
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }

    alert('Manutenção interna concluída! O custo foi somado ao custo acumulado e o aparelho voltou ao estoque disponível.');
    setCompleteModalRepair(null);
    setDiagnosis('');
    setPartsUsed('');
    setRepairCost('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-purple-600" />
            Manutenções Internas do Estoque
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Reparos em aparelhos próprios da loja. O custo das peças e serviços é incorporado ao custo acumulado do aparelho.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Abrir Manutenção no Estoque
        </button>
      </div>

      {/* TABELA DE REPAROS INTERNOS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Aparelho do Estoque</th>
                <th className="py-3.5 px-4">IMEI</th>
                <th className="py-3.5 px-4">Defeito / Serviço Necessário</th>
                <th className="py-3.5 px-4">Peças Utilizadas</th>
                <th className="py-3.5 px-4">Custo do Reparo (Incorporado)</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repairs.map((rep) => {
                const device = store.devices.find(d => d.id === rep.device_id);
                return (
                  <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {device?.brand} {device?.model}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {device?.imei}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs text-slate-700">
                      {rep.issue_description}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {rep.parts_used || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-purple-700">
                      {rep.repair_cost > 0 ? `+ ${formatBRL(Number(rep.repair_cost))}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        rep.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {rep.status === 'completed' ? 'Concluído' : 'Na Bancada'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {rep.status === 'in_progress' && (
                        <button
                          onClick={() => {
                            setCompleteModalRepair(rep);
                            setDiagnosis(rep.diagnosis || '');
                            setPartsUsed(rep.parts_used || '');
                            setRepairCost(rep.repair_cost ? rep.repair_cost.toString() : '');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm"
                        >
                          Concluir & Incorporar Custo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {repairs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma manutenção interna aberta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE ABERTURA DE MANUTENÇÃO INTERNA */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-600" />
                Abrir Manutenção em Aparelho do Estoque
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenRepair} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Selecionar Aparelho da Loja *</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  required
                >
                  <option value="">Selecione o aparelho...</option>
                  {storeDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.brand} {d.model} ({d.storage_capacity} - {d.color}) | IMEI: {d.imei}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motivo do Reparo / Peça Necessária *</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Troca preventiva de bateria, substituição da carcaça traseira, ajuste de câmera..."
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-500"
                  required
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
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl"
                >
                  Iniciar Manutenção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONCLUSÃO E INCORPORAÇÃO DE CUSTO */}
      {completeModalRepair && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Concluir Reparo & Incorporar Custo
              </h3>
              <button onClick={() => setCompleteModalRepair(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteRepair} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Serviço Realizado / Laudo *</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Bateria trocada por componente novo original homologado."
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Peças Utilizadas *</label>
                <input
                  type="text"
                  placeholder="Ex: Bateria Premium iFix iPhone 14 Pro + Fita adesiva"
                  value={partsUsed}
                  onChange={(e) => setPartsUsed(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-purple-900 block mb-1">
                  Custo Total das Peças Utilizadas (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={repairCost}
                  onChange={(e) => setRepairCost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black text-sm text-purple-700"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Este valor será somado diretamente ao custo acumulado do aparelho no estoque.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCompleteModalRepair(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md"
                >
                  Concluir e Liberar Aparelho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
