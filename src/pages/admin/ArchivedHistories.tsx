// ============================================================================
// CONTROLPHONE — HISTÓRICOS ARQUIVADOS (administrador da loja, somente leitura)
// 1. Ciclos arquivados: só os ciclos com arquivamento contratado e concluído no
//    Reset Geral da Loja; vendas, estoque, financeiro, clientes e fornecedores
//    do ciclo, sem nenhuma ação de edição.
// 2. Comprovantes e garantias preservados: de todas as vendas de ciclos
//    encerrados, com ou sem arquivamento pago. Os PDFs são gerados de novo pelos
//    mesmos modelos das vendas e não entram nas vendas nem nos indicadores.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Archive, FileDown, Loader2, ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { store } from '../../lib/store';
import { formatBRL } from '../../lib/labels';
import { saleRevenue } from '../../lib/saleFinance';
import { Sale } from '../../types';
import { PreservedDocument, TenantCycle, fetchCycleArchive, fetchCycles, fetchPreservedDocuments } from '../../lib/resetApi';
import { preservedDocumentList, runPreservedDocument } from '../../lib/pdf/preservedDocuments';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
type Rows = Record<string, Record<string, unknown>[]>;
type ArchiveTab = 'sales' | 'stock' | 'finance' | 'customers' | 'suppliers';

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${active ? 'btn-tenant-primary' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
const th = 'py-3 px-3 whitespace-nowrap';
const td = 'py-2.5 px-3';

const Table: React.FC<{ head: string[]; rows: React.ReactNode[][]; empty: string }> = ({ head, rows, empty }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
    <table className="w-full text-left text-xs">
      <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold">
        <tr>{head.map(h => <th key={h} className={th}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={td}>{c}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={head.length} className="py-8 text-center text-slate-400">{empty}</td></tr>}
      </tbody>
    </table>
  </div>
);

export const ArchivedHistories: React.FC = () => {
  const { currentTenant, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || '';
  const [section, setSection] = useState<'cycles' | 'documents'>('cycles');
  const [cycles, setCycles] = useState<TenantCycle[]>([]);
  const [docs, setDocs] = useState<PreservedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openCycle, setOpenCycle] = useState<TenantCycle | null>(null);
  const [archive, setArchive] = useState<Rows | null>(null);
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('sales');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!store.isRealMode || !tenantId) return;
    setLoading(true);
    void Promise.all([fetchCycles(tenantId), fetchPreservedDocuments(tenantId)]).then(([c, d]) => {
      setLoading(false);
      if (!c.ok) { setError(c.error); return; }
      setCycles(c.data.filter(x => x.status === 'closed' && x.archive_status === 'archived'));
      if (d.ok) setDocs(d.data);
    });
  }, [tenantId]);

  const openArchive = async (cycle: TenantCycle) => {
    setOpenCycle(cycle);
    setArchive(null);
    setArchiveTab('sales');
    const res = await fetchCycleArchive(cycle.id);
    if (!res.ok) { setError(res.error); setOpenCycle(null); return; }
    setArchive(res.data.tables);
  };

  const filteredDocs = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return docs;
    return docs.filter(d => String(d.sale_number).includes(t) || (d.customer_name || '').toLowerCase().includes(t) || d.imeis.some(i => i.includes(t)));
  }, [docs, search]);

  const runDoc = async (doc: PreservedDocument, defId: string) => {
    if (!currentTenant) return;
    const def = preservedDocumentList(doc, currentTenant, currentTheme).find(d => d.id === defId);
    if (def) setNotice(await runPreservedDocument(def, doc, currentTenant, currentTheme, 'download'));
  };

  if (!store.isRealMode) {
    return <p className="text-xs text-slate-500">Os históricos arquivados ficam disponíveis com o banco de dados (fora da demonstração).</p>;
  }

  // ---- ciclo aberto: somente leitura
  if (openCycle) {
    const records = (archive?.tenant_records || []) as { kind: string; data: Record<string, unknown> }[];
    const sales = records.filter(r => r.kind === 'sales').map(r => r.data as unknown as Sale).sort((a, b) => b.sale_number - a.sale_number);
    const expenses = records.filter(r => r.kind === 'expenses').map(r => r.data);
    const customers = archive?.customers || [];
    const nameOf = (id: unknown) => String(customers.find(c => c.id === id)?.name || '—');
    const s = openCycle.summary;
    return (
      <div className="space-y-5 animate-fade-in">
        <button type="button" onClick={() => setOpenCycle(null)} className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</button>
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Ciclo {openCycle.number} — arquivado</h2>
          <p className="text-xs text-slate-500">{when(openCycle.started_at)} a {when(openCycle.ended_at)} · somente leitura</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[['Vendas', String(s.sales)], ['Faturamento', formatBRL(Number(s.revenue))], ['Lucro bruto', formatBRL(Number(s.gross_profit))],
            ['Resultado (após despesas)', formatBRL(Number(s.result))]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-2xl border border-slate-200/80 p-3"><span className="block text-[10px] uppercase font-bold text-slate-400">{l}</span><span className="font-black text-slate-800">{v}</span></div>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {([['sales', 'Vendas'], ['stock', 'Estoque'], ['finance', 'Financeiro'], ['customers', 'Clientes'], ['suppliers', 'Fornecedores']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setArchiveTab(id)} className={tabBtn(archiveTab === id)}>{label}</button>
          ))}
        </div>
        {!archive && <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Abrindo o arquivo…</p>}
        {archive && archiveTab === 'sales' && (
          <Table head={['Nº', 'Data', 'Cliente', 'Origem', 'Total', 'Lucro', 'Situação']} empty="Nenhuma venda no ciclo."
            rows={sales.map(v => [`#${v.sale_number}`, when(v.created_at), nameOf(v.customer_id), v.sales_origin, formatBRL(saleRevenue(v)),
              v.status === 'completed' ? formatBRL(Number(v.gross_profit)) : '—', v.deleted_at ? 'Excluída' : v.status === 'cancelled' ? 'Cancelada' : 'Concluída'])} />
        )}
        {archive && archiveTab === 'stock' && (
          <div className="space-y-3">
            <Table head={['Aparelho', 'IMEI', 'Situação', 'Custo', 'Preço', 'Entrada']} empty="Nenhum aparelho no ciclo."
              rows={(archive.devices || []).map(d => [`${d.brand} ${d.model} ${d.storage_capacity}`, String(d.imei), String(d.status),
                formatBRL(Number(d.acquisition_cost)), formatBRL(Number(d.suggested_price)), day(String(d.entry_date))])} />
            <Table head={['Acessório', 'Categoria', 'Quantidade', 'Custo', 'Preço']} empty="Nenhum acessório no ciclo."
              rows={(archive.accessories || []).map(a => [String(a.name), String(a.category), String(a.quantity), formatBRL(Number(a.unit_cost)), formatBRL(Number(a.sale_price))])} />
          </div>
        )}
        {archive && archiveTab === 'finance' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[['Faturamento', formatBRL(Number(s.revenue))], ['Lucro bruto', formatBRL(Number(s.gross_profit))], ['Despesas', formatBRL(Number(s.expenses))],
                ['Aparelhos vendidos', String(s.devices_sold)]].map(([l, v]) => (
                <div key={l} className="bg-white rounded-2xl border border-slate-200/80 p-3"><span className="block text-[10px] uppercase font-bold text-slate-400">{l}</span><span className="font-black text-slate-800">{v}</span></div>
              ))}
            </div>
            <Table head={['Data', 'Descrição', 'Categoria', 'Valor']} empty="Nenhuma despesa no ciclo."
              rows={expenses.map(e => [day(String(e.created_at || e.date || '')), String(e.description || ''), String(e.category || ''), formatBRL(Number(e.amount))])} />
          </div>
        )}
        {archive && archiveTab === 'customers' && (
          <Table head={['Nome', 'Telefone', 'E-mail', 'Desde']} empty="Nenhum cliente no ciclo."
            rows={customers.map(c => [String(c.name), String(c.phone || ''), String(c.email || '—'), day(String(c.created_at))])} />
        )}
        {archive && archiveTab === 'suppliers' && (
          <Table head={['Nome', 'Empresa', 'Telefone']} empty="Nenhum fornecedor no ciclo."
            rows={(archive.suppliers || []).map(f => [String(f.name), String(f.company_name || '—'), String(f.phone || '')])} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2"><Archive className="w-5 h-5 text-blue-600" /> Históricos Arquivados</h2>
        <p className="text-xs text-slate-500">Ciclos anteriores ao reset da loja (somente consulta) e os comprovantes e garantias das vendas desses ciclos.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setSection('cycles')} className={tabBtn(section === 'cycles')}>Ciclos arquivados</button>
        <button type="button" onClick={() => setSection('documents')} className={tabBtn(section === 'documents')}>Comprovantes e garantias preservados</button>
      </div>
      {loading && <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>}
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      {notice && <p role="status" className="text-xs font-semibold text-slate-600">{notice}</p>}

      {section === 'cycles' && (
        <Table head={['Ciclo', 'Início', 'Encerramento', 'Vendas', 'Faturamento', 'Resultado', 'Aparelhos vendidos', 'Arquivamento', '']}
          empty="Nenhum ciclo arquivado. Os históricos ficam aqui quando o arquivamento é contratado no reset da loja."
          rows={cycles.map(c => [`Ciclo ${c.number}`, day(c.started_at), day(c.ended_at), String(c.summary.sales), formatBRL(Number(c.summary.revenue)),
            formatBRL(Number(c.summary.result)), String(c.summary.devices_sold), 'Concluído',
            <button key="open" type="button" onClick={() => openArchive(c)} className="text-blue-600 font-semibold hover:underline">Consultar</button>])} />
      )}

      {section === 'documents' && (
        <div className="space-y-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por Nº da venda, cliente ou IMEI..."
            className="w-full sm:w-80 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white" />
          <Table head={['Nº', 'Data', 'Cliente', 'Produto', 'IMEI', 'Garantia', 'Ciclo', 'Documentos']}
            empty="Nenhum comprovante preservado. Eles aparecem aqui depois de um reset da loja."
            rows={filteredDocs.map(d => [
              `#${d.sale_number}`, day(d.sale_date), d.customer_name || '—', d.products || '—', d.imeis.join(', ') || '—',
              d.warranties.map(w => w.type === 'apple' ? 'Apple 1 ano' : `${w.days} dias até ${w.end ? day(w.end + 'T12:00:00') : '—'} (${w.status === 'active' ? 'ativa' : w.status})`).join(' · ') || '—',
              `Ciclo ${d.cycle_number}`,
              <span key="docs" className="flex flex-wrap gap-1">
                {currentTenant && preservedDocumentList(d, currentTenant, currentTheme).map(def => (
                  <button key={def.id} type="button" onClick={() => runDoc(d, def.id)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 whitespace-nowrap">
                    {def.id.includes('warranty') ? <FileText className="w-3 h-3" /> : <FileDown className="w-3 h-3" />}
                    {def.id === 'apple-warranty' ? 'Garantia Apple' : def.id === 'warranty-term' ? 'Termo de Garantia' : 'Comprovante'}
                  </button>
                ))}
              </span>
            ])} />
        </div>
      )}
    </div>
  );
};
