// ============================================================================
// CONTROLPHONE — FILA TÉCNICA DE ORDENS DE SERVIÇO (TÉCNICO)
// ============================================================================

import React, { useState } from 'react';
import { Wrench, CheckCircle2, Search, X, FileText, Smartphone } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { ServiceOrder } from '../../types';
import { OS_STATUS_LABELS } from '../../lib/labels';
import { formatBRL } from '../../lib/labels';

export const TechnicianOSQueue: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState('');
  const [diagnosisModalOS, setDiagnosisModalOS] = useState<ServiceOrder | null>(null);

  // Form states de diagnóstico técnico
  const [diagnosis, setDiagnosis] = useState('');
  const [problemFound, setProblemFound] = useState('');
  const [serviceNeeded, setServiceNeeded] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');

  const serviceOrders = store.serviceOrders.filter(o => o.tenant_id === tenantId && o.origin === 'external');

  const filteredOS = serviceOrders.filter(o =>
    o.os_number.toString().includes(searchTerm) ||
    o.device_model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.reported_defect.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveDiagnosis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosisModalOS || !diagnosis) return;

    const saved = store.updateServiceOrderDiagnosis({
      tenantId,
      osId: diagnosisModalOS.id,
      technicianId: currentUser.id,
      diagnosis,
      partsCost: parseFloat(partsCost) || 0,
      serviceCost: parseFloat(serviceCost) || 0,
      estimatedDeliveryDate: estimatedDelivery,
      problemFound,
      serviceNeeded,
      technicalNotes
    });
    if (!saved) {
      alert('Não foi possível lançar o diagnóstico: esta ordem já saiu da etapa de diagnóstico.');
      return;
    }

    alert('Diagnóstico e custos técnicos lançados! A ordem aguarda o administrador definir o orçamento.');
    setDiagnosisModalOS(null);
    setDiagnosis('');
    setPartsCost('');
    setServiceCost('');
  };

  const handleMarkReady = (os: ServiceOrder) => {
    const ready = store.markServiceOrderReady({
      tenantId,
      osId: os.id,
      technicianId: currentUser.id
    });
    if (!ready) {
      alert('Não foi possível concluir: esta ordem não está em manutenção.');
      return;
    }
    alert(`OS #${os.os_number} marcada como pronta para retirada.`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <Wrench className="w-5 h-5 text-blue-600" />
          Fila de Ordens de Serviço (Bancada Técnica)
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Avaliação de componentes, laudo técnico, apontamento de custos de peças e conclusão de reparos.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nº da Ordem, Modelo ou Defeito..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* TABELA DE OS PARA O TÉCNICO */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nº da Ordem</th>
                <th className="py-3.5 px-4">Aparelho & IMEI</th>
                <th className="py-3.5 px-4">Defeito Relatado</th>
                <th className="py-3.5 px-4">Diagnóstico Técnico</th>
                <th className="py-3.5 px-4">Custo Peças</th>
                <th className="py-3.5 px-4">Custo Serviço</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ação Técnica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOS.map((os) => (
                <tr key={os.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                    OS #{os.os_number}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{os.device_brand} {os.device_model}</div>
                    <span className="text-[10px] font-mono text-slate-400">{os.imei || 'IMEI não informado'}</span>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs text-slate-600">
                    {os.reported_defect}
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    {os.technician_diagnosis ? (
                      <span className="text-slate-800 font-semibold">{os.technician_diagnosis}</span>
                    ) : (
                      <span className="text-slate-400 italic">Pendente de laudo</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-700">
                    {formatBRL(Number(os.technician_parts_cost))}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-700">
                    {formatBRL(Number(os.technician_service_cost))}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {OS_STATUS_LABELS[os.status] || os.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    {os.status === 'waiting_diagnosis' && (
                      <button
                        onClick={() => {
                          setDiagnosisModalOS(os);
                          setDiagnosis(os.technician_diagnosis || '');
                          setProblemFound(os.problem_found || '');
                          setServiceNeeded(os.service_needed || '');
                          setTechnicalNotes(os.technical_notes || '');
                          setPartsCost(os.technician_parts_cost.toString());
                          setServiceCost(os.technician_service_cost.toString());
                        }}
                        className="btn-tenant-primary px-3 py-1.5 rounded-xl font-bold text-[11px]"
                      >
                        Lançar Diagnóstico
                      </button>
                    )}

                    {os.status === 'in_maintenance' && (
                      <button
                        onClick={() => handleMarkReady(os)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm"
                      >
                        Concluir Reparo (Pronto)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DIAGNÓSTICO TÉCNICO */}
      {diagnosisModalOS && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Laudo Técnico & Custos de Peças — OS #{diagnosisModalOS.os_number}
              </h3>
              <button onClick={() => setDiagnosisModalOS(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDiagnosis} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="font-bold text-slate-700 block">Aparelho: {diagnosisModalOS.device_brand} {diagnosisModalOS.device_model}</span>
                <span className="text-slate-500">Defeito Relatado: {diagnosisModalOS.reported_defect}</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Diagnóstico *</label>
                <textarea
                  rows={3}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Ex: Curto no circuito de carga, conector danificado. Necessária substituição da placa dock..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Problema Encontrado</label>
                  <input type="text" value={problemFound} onChange={(e) => setProblemFound(e.target.value)} placeholder="Ex: Conector de carga oxidado" className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Serviço Necessário</label>
                  <input type="text" value={serviceNeeded} onChange={(e) => setServiceNeeded(e.target.value)} placeholder="Ex: Troca do conector de carga" className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações Técnicas</label>
                <input type="text" value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo das Peças (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={partsCost}
                    onChange={(e) => setPartsCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo de Mão de Obra (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={serviceCost}
                    onChange={(e) => setServiceCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Previsão de Conclusão</label>
                <input
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDiagnosisModalOS(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl"
                >
                  Enviar para Orçamento do Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
