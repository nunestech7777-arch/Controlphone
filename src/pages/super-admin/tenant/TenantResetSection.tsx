// ============================================================================
// CONTROLPHONE — RESET GERAL DA LOJA (EXCLUSIVO SUPER ADMIN)
// Aba Configurações da gestão da loja. Encerra o ciclo operacional e abre um novo,
// com estoque, vendas, financeiro e indicadores zerados. Comprovantes e garantias
// das vendas ficam sempre preservados; os históricos completos, só com o
// arquivamento pago. Tudo é conferido e executado no banco (migration 27).
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Archive, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Tenant } from '../../../types';
import { store, newUuid } from '../../../lib/store';
import { formatBRL } from '../../../lib/labels';
import {
  ArchiveOrder, ResetPreview, ResetRun, TenantCycle, confirmArchivePayment, createArchiveOrder, fetchCycles,
  fetchResetPreview, fetchResetRuns, refuseArchiveOrder, resetTenant, setArchivePrice
} from '../../../lib/resetApi';
import { refreshRealData } from '../../../lib/realSession';

const primaryBtn = 'px-4 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 disabled:pointer-events-none';
const ghostBtn = 'px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100 text-xs inline-flex items-center gap-2 transition-colors disabled:opacity-60 disabled:pointer-events-none';
const dangerBtn = 'px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none';
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-blue-500';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const ORDER_LABEL: Record<ArchiveOrder['status'], string> = {
  pending: 'Aguardando pagamento', paid: 'Pago — pronto para o reset', refused: 'Recusado', used: 'Usado em um reset'
};

export const TenantResetSection: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const real = store.isRealMode;
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [cycles, setCycles] = useState<TenantCycle[]>([]);
  const [runs, setRuns] = useState<ResetRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [price, setPrice] = useState('');
  const [reference, setReference] = useState('');
  const [refuseReason, setRefuseReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    if (!real) return;
    setLoading(true);
    const [p, c, r] = await Promise.all([fetchResetPreview(tenant.id), fetchCycles(tenant.id), fetchResetRuns(tenant.id)]);
    setLoading(false);
    if (!p.ok) { setError(p.error); return; }
    setError('');
    setPreview(p.data);
    setPrice(p.data.archive_price ? String(p.data.archive_price).replace('.', ',') : '');
    if (c.ok) setCycles(c.data);
    if (r.ok) setRuns(r.data);
  }, [real, tenant.id]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Não foi possível concluir.'); return; }
    setError('');
    setNotice(success);
    await load();
  };

  const order = preview?.open_order || null;

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/30 p-5 space-y-4 text-xs" aria-label="Reset Geral da Loja">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-rose-600" /> Reset Geral da Loja
          </h3>
          <p className="text-slate-600 mt-1 max-w-2xl">
            Reinicie os dados operacionais desta loja para começar um novo ciclo. Você poderá preservar os históricos anteriores mediante pagamento.
          </p>
          {preview && <p className="text-slate-500 mt-1">Ciclo atual: <b>Ciclo {preview.cycle_number}</b>, desde {when(preview.cycle_started_at)}.</p>}
        </div>
        <button type="button" onClick={() => setModal(true)} disabled={!real || !preview || busy} className={dangerBtn}>
          <RotateCcw className="w-4 h-4" /> Reiniciar dados da loja
        </button>
      </div>

      {!real && <p className="font-semibold text-amber-700">Disponível somente com o banco de dados (fora da demonstração).</p>}
      {loading && <p className="text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>}
      {error && <p role="alert" className="font-semibold text-rose-600">{error}</p>}
      {notice && <p role="status" className="font-semibold text-emerald-700">{notice}</p>}

      {real && preview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ARQUIVAMENTO PAGO */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="font-extrabold text-slate-700 flex items-center gap-2"><Archive className="w-4 h-4 text-blue-600" /> Arquivamento dos históricos</h4>
            <div>
              <label htmlFor="archive-price" className="font-bold text-slate-600 block mb-1">Valor do arquivamento (todas as lojas)</label>
              <div className="flex gap-2">
                <input id="archive-price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="R$ 0,00" className={input} />
                <button type="button" disabled={busy} className={ghostBtn}
                  onClick={() => act(() => setArchivePrice(Number(price.replace(/\./g, '').replace(',', '.'))), 'Valor do arquivamento salvo.')}>Salvar</button>
              </div>
            </div>
            {!order && (
              <button type="button" disabled={busy || !preview.archive_price} className={ghostBtn}
                onClick={() => act(() => createArchiveOrder(tenant.id), 'Pedido de arquivamento criado. Registre o pagamento quando ele for recebido.')}>
                Gerar pedido de arquivamento{preview.archive_price ? ` (${formatBRL(Number(preview.archive_price))})` : ''}
              </button>
            )}
            {order && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-slate-700">Pedido de {formatBRL(Number(order.amount))}</span>
                  <span className={`font-bold ${order.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{ORDER_LABEL[order.status]}</span>
                </div>
                {order.status === 'paid' && <p className="text-slate-500">Pagamento registrado em {when(order.confirmed_at)} · ref. {order.payment_reference}</p>}
                {order.status === 'pending' && (
                  <>
                    <p className="text-slate-500">O pedido só vale como pago depois que o pagamento for recebido e registrado aqui, com a referência do comprovante.</p>
                    <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Referência do pagamento recebido (ex.: ID do PIX)" className={input} aria-label="Referência do pagamento" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy || reference.trim().length < 4} className={primaryBtn}
                        onClick={() => act(() => confirmArchivePayment(order.id, reference), 'Pagamento registrado. O reset com arquivamento já pode ser feito.')}>
                        <ShieldCheck className="w-4 h-4" /> Registrar pagamento recebido
                      </button>
                      <input value={refuseReason} onChange={e => setRefuseReason(e.target.value)} placeholder="Motivo da recusa" className={`${input} sm:w-48`} aria-label="Motivo da recusa" />
                      <button type="button" disabled={busy} className={ghostBtn}
                        onClick={() => act(() => refuseArchiveOrder(order.id, refuseReason), 'Pedido recusado.')}>Recusar</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* CICLOS E REGISTRO */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="font-extrabold text-slate-700">Ciclos e resets</h4>
            {cycles.length === 0 && <p className="text-slate-500">A loja nunca foi reiniciada (Ciclo 1).</p>}
            <ul className="space-y-1">
              {cycles.map(c => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-slate-700">Ciclo {c.number} — {c.status === 'active' ? 'Ativo' : 'Encerrado'}</span>
                  <span className="text-slate-500">{when(c.started_at)} → {c.ended_at ? when(c.ended_at) : 'hoje'}{c.status === 'closed' ? ` · ${c.archive_status === 'archived' ? 'arquivado' : 'sem arquivamento'}` : ''}</span>
                </li>
              ))}
            </ul>
            {runs.length > 0 && (
              <ul className="space-y-1 pt-2 border-t border-slate-100">
                {runs.slice(0, 6).map(r => (
                  <li key={r.id} className="text-slate-500">
                    {when(r.created_at)} · <b className={r.status === 'completed' ? 'text-emerald-700' : 'text-rose-600'}>
                      {r.status === 'completed' ? 'Concluído' : r.status === 'denied' ? 'Negado' : 'Falhou'}</b>
                    {r.mode ? ` · ${r.mode === 'archive' ? 'com arquivamento' : 'sem arquivamento'}` : ''}
                    {r.user_name ? ` · ${r.user_name}` : ''}{r.error ? ` · ${r.error}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {modal && preview && (
        <ResetModal tenant={tenant} preview={preview} onClose={() => setModal(false)}
          onDone={async (text) => { setModal(false); setNotice(text); setError(''); await load(); await refreshRealData(); }} />
      )}
    </section>
  );
};

const ResetModal: React.FC<{ tenant: Tenant; preview: ResetPreview; onClose: () => void; onDone: (text: string) => void }> = ({ tenant, preview, onClose, onDone }) => {
  const [requestId] = useState(() => newUuid());
  const [mode, setMode] = useState<'archive' | 'no_archive' | ''>('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [understood, setUnderstood] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const paidOrder = preview.open_order?.status === 'paid' ? preview.open_order : null;
  const s = preview.summary;
  const nameOk = name.trim() === tenant.trade_name.trim();

  const run = async () => {
    if (running || !mode) return;
    setRunning(true);
    const res = await resetTenant({ tenantId: tenant.id, mode, confirmName: name, requestId, orderId: mode === 'archive' ? paidOrder?.id : undefined });
    setRunning(false);
    if (!res.ok) { setError(res.error); setStep(1); return; }
    onDone(`Loja reiniciada: agora no Ciclo ${res.data.new_cycle_number}. ${res.data.preserved_documents} comprovante(s) de venda preservado(s)` +
      (res.data.archive_status === 'archived' ? '; os históricos do ciclo anterior foram arquivados.' : '; os históricos do ciclo anterior não foram arquivados.'));
  };

  const option = (id: 'archive' | 'no_archive', title: string, text: string, disabled = false, note = '') => (
    <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${mode === id ? 'border-rose-400 bg-rose-50' : 'border-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input type="radio" name="reset-mode" disabled={disabled} checked={mode === id} onChange={() => setMode(id)} className="mt-0.5" />
      <span>
        <span className="font-bold text-slate-800 block">{title}</span>
        <span className="text-slate-500 block">{text}</span>
        {note && <span className="text-amber-700 font-semibold block mt-0.5">{note}</span>}
      </span>
    </label>
  );

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-fade-in space-y-4 text-xs" role="dialog" aria-label="Reiniciar dados da loja">
        <h3 className="text-sm font-extrabold text-rose-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Reiniciar dados da loja</h3>
        <p className="text-slate-600">
          Esta operação iniciará um novo ciclo operacional, zerando estoque, vendas, financeiro, relatórios e indicadores. Os comprovantes PDF de vendas e garantias serão preservados.
        </p>

        {step === 1 && (
          <>
            <div className="space-y-2">
              {option('archive', 'Arquivar históricos e reiniciar', 'Preserve seus históricos operacionais mediante pagamento e comece um novo ciclo.',
                !paidOrder, paidOrder ? `Pagamento confirmado: ${formatBRL(Number(paidOrder.amount))}.` : 'Gere o pedido e registre o pagamento recebido antes (seção Arquivamento).')}
              {option('no_archive', 'Reiniciar sem arquivar', 'Comece um novo ciclo sem preservar os históricos operacionais anteriores.')}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="font-extrabold uppercase tracking-wider text-[10px] text-slate-500 block mb-2">Dados afetados — Ciclo {preview.cycle_number} de {tenant.trade_name}</span>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-slate-500">Aparelhos cadastrados</dt><dd className="font-bold">{s.devices} ({s.devices_available} disponíveis)</dd>
                <dt className="text-slate-500">Acessórios em estoque</dt><dd className="font-bold">{s.accessory_units} un.</dd>
                <dt className="text-slate-500">Vendas concluídas</dt><dd className="font-bold">{s.sales}</dd>
                <dt className="text-slate-500">Faturamento</dt><dd className="font-bold">{formatBRL(Number(s.revenue))}</dd>
                <dt className="text-slate-500">Lucro bruto</dt><dd className="font-bold">{formatBRL(Number(s.gross_profit))}</dd>
                <dt className="text-slate-500">Despesas</dt><dd className="font-bold">{formatBRL(Number(s.expenses))}</dd>
                <dt className="text-slate-500">Clientes / fornecedores</dt><dd className="font-bold">{s.customers} / {s.suppliers}</dd>
                <dt className="text-slate-500">Comprovantes preservados</dt><dd className="font-bold text-emerald-700">{preview.documents_to_preserve}</dd>
              </dl>
              <p className="text-slate-500 mt-2">Ficam: cadastro e identidade da loja, plano, usuários e permissões, configurações, modelos de documentos e o histórico de atividades.</p>
            </div>

            <div>
              <label htmlFor="reset-name" className="font-bold text-slate-700 block mb-1">Digite o nome exato da loja: <span className="font-mono">{tenant.trade_name}</span></label>
              <input id="reset-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" className={input} />
            </div>
            {error && <p role="alert" className="font-semibold text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={ghostBtn}>Voltar</button>
              <button type="button" disabled={!mode || !nameOk} onClick={() => { setError(''); setStep(2); }} className={dangerBtn}>Continuar</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 space-y-2">
              <p className="font-bold text-rose-700">Confirmação final — operação irreversível</p>
              <p className="text-slate-700">
                {mode === 'archive'
                  ? `O Ciclo ${preview.cycle_number} será arquivado (somente leitura) e a loja começará o Ciclo ${preview.cycle_number + 1} do zero.`
                  : `Os históricos operacionais do Ciclo ${preview.cycle_number} não ficarão disponíveis para o lojista. A loja começará o Ciclo ${preview.cycle_number + 1} do zero.`}
              </p>
              <label className="flex items-start gap-2 text-slate-700">
                <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} className="mt-0.5" />
                Entendo que estoque, vendas, financeiro, clientes, fornecedores e indicadores desta loja serão zerados.
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep(1)} disabled={running} className={ghostBtn}>Voltar</button>
              <button type="button" disabled={!understood || running} onClick={run} className={dangerBtn}>
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {running ? 'Reiniciando…' : 'Confirmar e reiniciar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
