// ============================================================================
// CONTROLPHONE — EXCLUIR VENDA (exclusão lógica, somente administrador)
// A venda sai da listagem e dos indicadores, mas fica gravada para auditoria.
// Excluir no sistema NÃO devolve o dinheiro: o estorno é registrado à parte.
// ============================================================================

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { store } from '../../lib/store';
import { formatBRL } from '../../lib/labels';
import { saleInterest, saleRevenue } from '../../lib/saleFinance';
import { Sale, SaleDeletionDeviceSituation, SaleRefundStatus } from '../../types';

export const DELETION_REASONS = [
  'Venda cadastrada por engano',
  'Dados incorretos',
  'Venda duplicada',
  'Erro no pagamento',
  'Outro motivo'
] as const;

const SITUATIONS: { id: SaleDeletionDeviceSituation; title: string; text: string }[] = [
  { id: 'in_store', title: 'O aparelho nunca saiu da loja', text: 'O mesmo IMEI volta ao estoque disponível.' },
  { id: 'with_customer', title: 'O aparelho foi entregue ao cliente', text: 'Não volta ao estoque sozinho: fica pendente até você conferir o retorno físico em "Vendas Excluídas".' },
  { id: 'awaiting_evaluation', title: 'O aparelho voltou, mas precisa de avaliação', text: 'Fica bloqueado para venda até a avaliação ou assistência.' }
];

export const REFUND_LABELS: Record<SaleRefundStatus, string> = {
  pending: 'Estorno pendente',
  partial: 'Estorno parcial',
  done: 'Estorno concluído',
  not_needed: 'Estorno não necessário'
};

interface Props {
  sale: Sale;
  tenantId: string;
  userId: string;
  /** Vendedor só trata o estorno como pendente: o administrador acerta depois */
  restrictRefund?: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteSaleModal: React.FC<Props> = ({ sale, tenantId, userId, restrictRefund, onClose, onDeleted }) => {
  const customer = store.customers.find(c => c.id === sale.customer_id)?.name || 'Cliente Balcão';
  const seller = store.profiles.find(p => p.id === sale.seller_id)?.full_name || 'Vendedor';
  const interest = saleInterest(sale);
  const hasDevice = (sale.items || []).some(it => it.item_type === 'device' && !it.returned_at);
  const isUpgrade = Boolean(sale.trade_in_id);
  const hasPayment = (sale.payments || []).length > 0;
  const warranties = store.warranties.filter(w => w.sale_id === sale.id && w.status === 'active').length;

  const [category, setCategory] = useState<string>(DELETION_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [situation, setSituation] = useState<SaleDeletionDeviceSituation>('in_store');
  const [refund, setRefund] = useState<SaleRefundStatus>(hasPayment ? 'pending' : 'not_needed');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState(hasPayment ? '' : 'Venda sem pagamento registrado.');
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    const other = category === 'Outro motivo';
    if (other && !detail.trim()) { setError('Descreva o motivo da exclusão.'); return; }
    const reason = detail.trim() && !other ? `${category}: ${detail.trim()}` : other ? detail.trim() : category;
    const result = store.deleteSale(sale.id, tenantId, userId, {
      reason,
      deviceSituation: hasDevice ? situation : 'in_store',
      refundStatus: refund,
      refundAmount: refund === 'partial' ? Number(refundAmount.replace(',', '.')) : undefined,
      refundNote,
      refundConfirmed
    });
    if (!result.ok) { setError(result.error || 'Não foi possível excluir a venda.'); return; }
    onDeleted();
  };

  const field = 'w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 bg-white';
  const label = 'text-xs font-bold text-slate-700 block mb-1';

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl animate-fade-in" role="dialog" aria-label="Excluir venda">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-extrabold text-rose-600 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Excluir venda
          </h3>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs text-slate-600 mb-3">
          Tem certeza de que deseja excluir esta venda? Ela será removida da listagem de vendas e seus indicadores serão atualizados.
        </p>

        <dl className="grid grid-cols-2 gap-2 text-xs rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4">
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Venda</dt><dd className="font-bold text-slate-800">#{sale.sale_number}</dd></div>
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Data</dt><dd className="font-semibold text-slate-800">{new Date(sale.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Cliente</dt><dd className="font-semibold text-slate-800">{customer}</dd></div>
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Vendedor</dt><dd className="font-semibold text-slate-800">{seller}</dd></div>
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Valor dos produtos</dt><dd className="font-semibold text-slate-800">{formatBRL(Number(sale.total_amount))}</dd></div>
          <div><dt className="text-[10px] uppercase font-bold text-slate-400">Juros da maquininha</dt><dd className="font-semibold text-slate-800">{formatBRL(interest)}</dd></div>
          <div className="col-span-2"><dt className="text-[10px] uppercase font-bold text-slate-400">Total cobrado</dt><dd className="font-black text-slate-900">{formatBRL(saleRevenue(sale))}</dd></div>
        </dl>

        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="del-reason">Motivo da exclusão *</label>
            <select id="del-reason" value={category} onChange={e => setCategory(e.target.value)} className={field}>
              {DELETION_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
            <textarea
              rows={2}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder={category === 'Outro motivo' ? 'Descreva o motivo (obrigatório)' : 'Detalhes (opcional)'}
              className={`${field} mt-2`}
              aria-label="Detalhes do motivo"
            />
          </div>

          {hasDevice && (
            <fieldset>
              <legend className={label}>Onde está o aparelho? *</legend>
              <div className="space-y-1.5">
                {SITUATIONS.map(opt => {
                  const blocked = isUpgrade && opt.id !== 'in_store';
                  return (
                    <label key={opt.id} className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs cursor-pointer ${
                      situation === opt.id ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                    } ${blocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input type="radio" name="del-situation" disabled={blocked} checked={situation === opt.id} onChange={() => setSituation(opt.id)} className="mt-0.5" />
                      <span>
                        <span className="font-bold text-slate-800 block">{opt.title}</span>
                        <span className="text-slate-500">{blocked ? 'Upgrade já entregue segue por Trocas e Devoluções.' : opt.text}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {hasPayment && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Esta venda possui pagamento registrado. A exclusão não realiza automaticamente o estorno do dinheiro.
              </p>
              <div>
                <label className={label} htmlFor="del-refund">Situação do estorno</label>
                <select id="del-refund" value={refund} onChange={e => setRefund(e.target.value as SaleRefundStatus)} className={field}>
                  {(Object.keys(REFUND_LABELS) as SaleRefundStatus[])
                    .filter(k => !restrictRefund || k === 'pending' || k === 'not_needed')
                    .map(k => <option key={k} value={k}>{REFUND_LABELS[k]}</option>)}
                </select>
              </div>
              {refund === 'partial' && (
                <input value={refundAmount} onChange={e => setRefundAmount(e.target.value)} inputMode="decimal" placeholder="Valor já devolvido (R$)" className={field} aria-label="Valor devolvido" />
              )}
              {(refund === 'not_needed' || refund === 'done' || refund === 'partial') && (
                <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder={refund === 'not_needed' ? 'Por que não é necessário?' : 'Referência da devolução (opcional)'} className={field} aria-label="Observação do estorno" />
              )}
              {(refund === 'done' || refund === 'partial') && (
                <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={refundConfirmed} onChange={e => setRefundConfirmed(e.target.checked)} className="mt-0.5" />
                  Confirmo que o dinheiro foi realmente devolvido ao cliente.
                </label>
              )}
            </div>
          )}

          <ul className="text-[11px] text-slate-500 space-y-1 list-disc pl-4">
            {warranties > 0 && <li>{warranties} garantia(s) vinculada(s) serão invalidadas; o histórico é preservado.</li>}
            <li>Pagamentos e documentos já emitidos são preservados. Se houve nota fiscal, o cancelamento fiscal precisa ser feito à parte.</li>
            <li>O faturamento, os juros, o lucro, o ranking e as metas deixam de contar esta venda.</li>
          </ul>

          {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
            <button type="button" onClick={submit} className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md">Confirmar exclusão</button>
          </div>
        </div>
      </div>
    </div>
  );
};
