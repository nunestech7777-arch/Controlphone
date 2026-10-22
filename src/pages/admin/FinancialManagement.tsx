// ============================================================================
// CONTROLPHONE — FINANCEIRO EXCLUSIVO DO ADMIN (DRE, DESPESAS & LUCRO REAL)
// O status de uma despesa só muda pelo modal de edição. DRE, lucro líquido e
// fluxo de caixa são calculados a partir do status, então atualizam juntos.
// ============================================================================

import React, { useRef, useState } from 'react';
import { DollarSign, Plus, X, Paperclip } from 'lucide-react';
import { store, toLocalDay } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Expense, ExpenseCategory, PaymentMethod } from '../../types';
import { formatBRL } from '../../lib/labels';
import { periodFinance } from '../../lib/saleFinance';

type ExpenseFilter = 'all' | 'paid' | 'pending' | 'overdue';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Aluguel',
  utilities: 'Energia / Água',
  internet_telecom: 'Internet & Telefonia',
  salaries_commissions: 'Salários & Comissões',
  marketing_ads: 'Marketing & Tráfego',
  parts_maintenance: 'Peças & Ferramentas',
  software_tools: 'Softwares & Ferramentas',
  taxes_fees: 'Impostos & Taxas',
  other: 'Outros'
};

const METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  other: 'Outro'
};
const METHODS: PaymentMethod[] = ['pix', 'credit_card', 'debit_card', 'cash', 'other'];

const RECEIPT_MAX_BYTES = 1024 * 1024; // 1 MB (comprovante fica no estado local no modo demonstração)
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500';
const formatDay = (day?: string) => (day ? day.slice(0, 10).split('-').reverse().join('/') : '—');

export const FinancialManagement: React.FC = () => {
  const { currentTenant, currentUser, isSupportMode } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';
  const userRole = isSupportMode ? 'super_admin' : currentUser.role;
  const today = toLocalDay(new Date());

  const [filter, setFilter] = useState<ExpenseFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const receiptInput = useRef<HTMLInputElement>(null);

  // Formulário
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [paymentDate, setPaymentDate] = useState(today);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod>('pix');
  const [receipt, setReceipt] = useState<{ name: string; url: string } | null>(null);
  const [receiptChanged, setReceiptChanged] = useState(false);

  const sales = store.sales.filter(s => s.tenant_id === tenantId && s.status === 'completed');
  const expenses = store.expenses.filter(e => e.tenant_id === tenantId);
  const editing = expenses.find(e => e.id === editingId);

  // Assistência externa entregue e paga: receita de serviço (separada da venda de aparelhos)
  const serviceOrders = store.serviceOrders.filter(
    o => o.tenant_id === tenantId && o.origin === 'external' && o.status === 'delivered' && o.payment_status === 'paid'
  );
  const serviceRevenue = serviceOrders.reduce((a, o) => a + Number(o.paid_amount || 0), 0);
  const serviceCost = serviceOrders.reduce(
    (a, o) => a + Number(o.technician_parts_cost) + Number(o.technician_service_cost), 0
  );

  // Cálculos DRE (somente despesas PAGAS entram no resultado). O faturamento inclui os juros da maquininha
  // cobrados no cartão, mas eles não são lucro dos produtos: saem antes do lucro das vendas.
  const salesFinance = periodFinance(sales);
  const cardInterest = salesFinance.interest;
  const totalRevenue = salesFinance.revenue + serviceRevenue;
  const totalProductCost = sales.reduce((a, s) => a + Number(s.total_cost), 0) + serviceCost;
  const grossProfit = totalRevenue - cardInterest - totalProductCost;

  const isOverdue = (e: Expense) => e.status === 'pending' && e.due_date < today;
  const totalPaidExpenses = expenses.filter(e => e.status === 'paid').reduce((a, e) => a + Number(e.amount), 0);
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((a, e) => a + Number(e.amount), 0);
  const totalOverdue = expenses.filter(isOverdue).reduce((a, e) => a + Number(e.amount), 0);
  const netProfit = grossProfit - totalPaidExpenses;

  const filters: { id: ExpenseFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: expenses.length },
    { id: 'paid', label: 'Pagas', count: expenses.filter(e => e.status === 'paid').length },
    { id: 'pending', label: 'Pendentes', count: expenses.filter(e => e.status === 'pending').length },
    { id: 'overdue', label: 'Vencidas', count: expenses.filter(isOverdue).length }
  ];

  const visibleExpenses = expenses
    .filter(e =>
      filter === 'all' ? true : filter === 'paid' ? e.status === 'paid' : filter === 'pending' ? e.status === 'pending' : isOverdue(e)
    )
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  const openCreate = () => {
    setEditingId(null);
    setDescription(''); setCategory('rent'); setAmount(''); setDueDate(''); setPaymentMethod('pix'); setNotes('');
    setStatus('pending'); setPaymentDate(today); setPaidMethod('pix'); setReceipt(null); setReceiptChanged(false); setError('');
    setIsModalOpen(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setDescription(exp.description);
    setCategory(exp.category);
    setAmount(String(exp.amount));
    setDueDate(exp.due_date);
    setPaymentMethod(exp.payment_method || 'pix');
    setNotes(exp.notes || '');
    setStatus(exp.status);
    setPaymentDate(exp.payment_date || today);
    setPaidMethod(exp.paid_method || exp.payment_method || 'pix');
    setReceipt(exp.receipt_name && exp.receipt_url ? { name: exp.receipt_name, url: exp.receipt_url } : null);
    setReceiptChanged(false);
    setError('');
    setIsModalOpen(true);
  };

  const handleReceiptPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!RECEIPT_TYPES.includes(file.type)) { setError('Comprovante: envie uma imagem (JPG, PNG, WEBP) ou PDF.'); return; }
    if (file.size > RECEIPT_MAX_BYTES) { setError('Comprovante: o arquivo deve ter no máximo 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setReceipt({ name: file.name, url: String(reader.result) });
      setReceiptChanged(true);
      setError('');
    };
    reader.onerror = () => setError('Não foi possível ler o comprovante.');
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const result = store.saveExpense({
      tenantId, userId: currentUser.id, userRole, expenseId: editingId || undefined,
      description, category, amount: parseFloat(amount), dueDate, paymentMethod, notes,
      status,
      paymentDate: status === 'paid' ? paymentDate : undefined,
      paidMethod: status === 'paid' ? paidMethod : undefined,
      receipt: status === 'paid' && receiptChanged ? receipt : undefined
    });
    if (!result.ok) { setError(result.error || 'Não foi possível salvar a despesa.'); return; }
    setIsModalOpen(false);
  };

  const smallCard = 'bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm';
  const smallLabel = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider block';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Financeiro
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Quanto a loja faturou, quanto custaram os produtos, as despesas e o lucro final.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Lançar Despesa
        </button>
      </div>

      {/* DRE GERENCIAL CONSOLIDADA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Faturamento</span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {formatBRL(totalRevenue)}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Vendas e serviços recebidos{cardInterest > 0 ? ` (inclui ${formatBRL(cardInterest)} de juros da maquininha)` : ''}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">(-) Custo dos Produtos Vendidos</span>
          <span className="text-xl font-black text-rose-600 mt-1 block">
            {formatBRL(totalProductCost)}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">Compra dos aparelhos + reparos</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">(=) Lucro das Vendas</span>
          <span className="text-xl font-black text-blue-600 mt-1 block">
            {formatBRL(grossProfit)}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {cardInterest > 0 && <>Sem os juros da maquininha | </>}
            Margem: {totalRevenue - cardInterest > 0 ? ((grossProfit / (totalRevenue - cardInterest)) * 100).toFixed(1) : '0'}%
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">(=) Lucro Final</span>
          <span className={`text-xl font-black mt-1 block ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatBRL(netProfit)}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">Após deduzir {formatBRL(totalPaidExpenses)} em despesas</p>
        </div>
      </div>


      {/* FLUXO DE CAIXA DAS DESPESAS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={smallCard}>
          <span className={smallLabel}>Saídas Pagas</span>
          <span className="text-lg font-black text-slate-900 mt-1 block">{formatBRL(totalPaidExpenses)}</span>
          <p className="text-[10px] text-slate-500 mt-0.5">Já deduzidas do lucro líquido</p>
        </div>
        <div className={smallCard}>
          <span className={smallLabel}>A Pagar (Pendentes)</span>
          <span className="text-lg font-black text-amber-600 mt-1 block">{formatBRL(totalPending)}</span>
          <p className="text-[10px] text-slate-500 mt-0.5">Ainda não entram no resultado</p>
        </div>
        <div className={smallCard}>
          <span className={smallLabel}>Vencidas</span>
          <span className={`text-lg font-black mt-1 block ${totalOverdue > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {formatBRL(totalOverdue)}
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">Pendentes com vencimento anterior a hoje</p>
        </div>
      </div>

      {/* LISTAGEM DE DESPESAS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">Despesas Operacionais Cadastradas</h3>
          <div className="flex items-center gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filter === f.id ? 'bg-[#0B0F17] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Descrição da Despesa</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Categoria</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Vencimento</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Forma Pagto</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Valor</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleExpenses.map((exp) => (
                <tr
                  key={exp.id}
                  onClick={() => openEdit(exp)}
                  title="Abrir despesa"
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-4 font-bold text-slate-800">{exp.description}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 whitespace-nowrap">
                      {CATEGORY_LABELS[exp.category] || 'Outros'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="text-slate-500">{formatDay(exp.due_date)}</span>
                    {isOverdue(exp) && <span className="block text-[10px] font-semibold text-rose-600">Vencida</span>}
                  </td>
                  <td className="py-3.5 px-4 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                    {METHOD_LABELS[(exp.status === 'paid' ? exp.paid_method : undefined) || exp.payment_method || 'pix'] || '—'}
                  </td>
                  <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap text-right">
                    {formatBRL(Number(exp.amount))}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      exp.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {exp.status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                </tr>
              ))}
              {visibleExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma despesa encontrada neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE LANÇAMENTO / EDIÇÃO DE DESPESA */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">
                {editing ? 'Editar Despesa' : 'Lançar Nova Despesa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Descrição *</label>
                <input
                  type="text"
                  placeholder="Ex: Aluguel / Energia / Google Ads"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputCls} font-semibold`}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Categoria *</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                    {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Valor (R$) *</label>
                  <input
                    type="number" step="0.01" min="0.01" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-bold`} required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Data de Vencimento *</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Forma de Pagamento</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                    {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
              </div>

              {/* STATUS DO PAGAMENTO */}
              <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status do Pagamento</span>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-fit">
                  {(['pending', 'paid'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      aria-pressed={status === st}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        status === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st === 'pending' ? 'Pendente' : 'Pago'}
                    </button>
                  ))}
                </div>

                {status === 'paid' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Data do Pagamento *</label>
                        <input type="date" value={paymentDate} max={today} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls} required />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Forma de Pagamento Utilizada *</label>
                        <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as PaymentMethod)} className={inputCls}>
                          {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Comprovante (opcional)</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => receiptInput.current?.click()}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {receipt ? 'Substituir comprovante' : 'Anexar comprovante'}
                        </button>
                        {receipt && (
                          <>
                            <a href={receipt.url} target="_blank" rel="noreferrer" download={receipt.name} className="text-[11px] font-semibold text-blue-600 hover:underline truncate max-w-[180px]">
                              {receipt.name}
                            </a>
                            <button
                              type="button"
                              onClick={() => { setReceipt(null); setReceiptChanged(true); }}
                              className="text-[11px] font-semibold text-rose-600 hover:underline"
                            >
                              Remover
                            </button>
                          </>
                        )}
                        <input ref={receiptInput} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleReceiptPick} className="hidden" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Imagem ou PDF, até 1 MB.</p>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {editing?.status === 'paid'
                      ? 'Ao salvar como Pendente, o pagamento é desfeito: a despesa sai do resultado e o lucro é recalculado.'
                      : 'Despesas pendentes não entram no resultado nem no lucro até serem pagas.'}
                  </p>
                )}
              </div>

              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  {editing ? 'Salvar Alterações' : 'Registrar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
