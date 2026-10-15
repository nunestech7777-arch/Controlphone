// ============================================================================
// CONTROLPHONE — CONFIRMAÇÃO DE EXCLUSÃO (OU INATIVAÇÃO) DE APARELHO
// Mostra o impacto conferido no servidor antes de qualquer alteração. Se houver
// histórico a preservar, oferece a inativação no lugar da exclusão.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Archive, Loader2, Trash2, X } from 'lucide-react';
import { Device, UserRole } from '../../types';
import { formatBRL } from '../../lib/stockMetrics';
import { DeviceRemovalCheck, deactivateDevice, loadRemovalCheck, removeDevice } from '../../lib/deviceRemoval';

interface DeviceRemovalModalProps {
  device: Device;
  tenantId: string;
  userId: string;
  userRole: UserRole;
  onClose: () => void;
  /** Concluído: a tela fecha os modais e mostra a mensagem */
  onDone: (message: string) => void;
}

export const DeviceRemovalModal: React.FC<DeviceRemovalModalProps> = ({ device, tenantId, userId, userRole, onClose, onDone }) => {
  const [check, setCheck] = useState<DeviceRemovalCheck | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let active = true;
    void loadRemovalCheck(device.id).then(result => {
      if (!active) return;
      if ('error' in result) setLoadError(result.error);
      else {
        setCheck(result);
        setBlockers(result.blockers);
      }
    });
    return () => { active = false; };
  }, [device.id]);

  const blocked = blockers.length > 0;

  const handleDelete = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    const result = await removeDevice({ deviceId: device.id, tenantId, userId, userRole });
    setRunning(false);
    if (result.ok) {
      onDone('Aparelho excluído com sucesso.');
      return;
    }
    setError(result.error);
    if (result.blockers && result.blockers.length > 0) setBlockers(result.blockers);
  };

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    setError('');
    const result = await deactivateDevice({ deviceId: device.id, tenantId, userId, userRole, reason });
    setRunning(false);
    if (result.ok) onDone('Aparelho inativado. Ele saiu do estoque disponível e o histórico foi preservado.');
    else setError(result.error);
  };

  return (
    <div className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="device-removal-title"
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 id="device-removal-title" className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            {deactivating ? <Archive className="w-5 h-5 text-amber-600" /> : <Trash2 className="w-5 h-5 text-rose-600" />}
            {deactivating ? 'Inativar Aparelho' : 'Excluir Aparelho'}
          </h3>
          <button onClick={onClose} disabled={running} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {!deactivating && !blocked && (
            <p className="text-sm font-bold text-slate-800">Tem certeza de que deseja excluir este aparelho?</p>
          )}

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1">
            <p className="font-bold text-slate-800">{device.brand} {device.model} {device.storage_capacity} - {device.color}</p>
            <p className="text-slate-600">IMEI: <span className="font-mono">{device.imei}</span></p>
            <p className="text-slate-600">Custo de aquisição: <span className="font-semibold">{formatBRL(Number(device.acquisition_cost))}</span></p>
          </div>

          {!check && !loadError && (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo os registros vinculados...</p>
          )}
          {loadError && <p className="text-rose-600 font-semibold">{loadError}</p>}

          {check && !blocked && !deactivating && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 space-y-1.5">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Esta ação removerá o aparelho do estoque e ajustará automaticamente os registros financeiros relacionados ao cadastro, quando aplicável.
              </p>
              <p>
                {check.purchasesCount > 0
                  ? `A compra registrada no histórico do fornecedor (${formatBRL(check.purchasesTotal)}) também será removida.`
                  : 'Não há lançamento financeiro ligado a este cadastro: nenhuma movimentação financeira será criada ou alterada.'}
              </p>
            </div>
          )}

          {check && blocked && !deactivating && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900 space-y-1.5">
              <p className="font-semibold">Não foi possível excluir este aparelho porque ele possui movimentações vinculadas.</p>
              <ul className="list-disc pl-5">
                {blockers.map(b => <li key={b}>{b}</li>)}
              </ul>
              {check.canDeactivate && (
                <p>Você pode inativá-lo: ele sai do estoque disponível, não pode mais ser vendido e todo o histórico é preservado.</p>
              )}
            </div>
          )}

          {deactivating && (
            <form id="deactivate-form" onSubmit={handleDeactivate} className="space-y-2">
              <p className="text-slate-600">
                O aparelho sai do estoque disponível e não poderá ser vendido. Vendas, pagamentos e demais registros são preservados.
                A inativação não faz baixa contábil: se precisar de ajuste financeiro, registre-o no Financeiro.
              </p>
              <label htmlFor="deactivate-reason" className="font-bold text-slate-700 block">Motivo *</label>
              <textarea
                id="deactivate-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
              />
            </form>
          )}

          {error && <p role="alert" className="text-rose-600 font-semibold">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={running}
              className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            {check && !blocked && !deactivating && (
              <button type="button" onClick={handleDelete} disabled={running}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold flex items-center gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir Aparelho
              </button>
            )}
            {check && blocked && check.canDeactivate && !deactivating && (
              <button type="button" onClick={() => { setDeactivating(true); setError(''); }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Inativar Aparelho
              </button>
            )}
            {deactivating && (
              <button type="submit" form="deactivate-form" disabled={running || !reason.trim()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold flex items-center gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                Confirmar Inativação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
