// ============================================================================
// CONTROLPHONE — CADASTRAR VÁRIOS APARELHOS (mesmo modelo, um IMEI por unidade)
// Dados gerais no topo, uma linha por aparelho (cartões no celular), resumo e
// confirmação no rodapé. Sem grade estética. Valores em reais (BRL).
// ============================================================================

import React, { useMemo, useState } from 'react';
import { ClipboardPaste, Layers, X, AlertTriangle } from 'lucide-react';
import { store, newUuid } from '../../lib/store';
import { BatchUnit, MAX_BATCH, parseBRL, parseImeiList, unitErrors, unitHasData } from '../../lib/deviceBatch';
import { formatBRL } from '../../lib/stockMetrics';
import { DeviceType } from '../../types';

const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
type Field = 'cost' | 'price' | 'color';

interface Props {
  tenantId: string;
  userId: string;
  userRole: string;
  onClose: () => void;
  onDone: (count: number) => void;
}

export const DeviceBatchModal: React.FC<Props> = ({ tenantId, userId, userRole, onClose, onDone }) => {
  const canSeeFinance = userRole === 'admin' || userRole === 'super_admin';
  const [batchId] = useState(() => newUuid());
  const newUnit = (cost: string, price: string): BatchUnit => ({ id: newUuid(), purchaseId: newUuid(), imei: '', color: '', battery: '', cost, price });

  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('128GB');
  const [deviceType, setDeviceType] = useState<DeviceType | ''>('');
  const [supplierId, setSupplierId] = useState('');
  const [origin, setOrigin] = useState<'purchase' | 'internal_transfer'>('purchase');
  const [entryDate, setEntryDate] = useState(todayInput());
  const [defCost, setDefCost] = useState('');
  const [defPrice, setDefPrice] = useState('');
  const [allColor, setAllColor] = useState('');
  const [qtyInput, setQtyInput] = useState('3');
  const [units, setUnits] = useState<BatchUnit[]>(() => [newUnit('', ''), newUnit('', ''), newUnit('', '')]);
  // células alteradas à mão: os valores padrão não passam por cima delas sem confirmação
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState<{ text: string; yes: () => void; no?: () => void } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);

  const suppliers = store.suppliers.filter(s => s.tenant_id === tenantId);
  const knownModels = useMemo(() => {
    const set = new Set<string>();
    store.devices.filter(d => d.tenant_id === tenantId && d.brand.trim().toLowerCase() === brand.trim().toLowerCase())
      .forEach(d => set.add(d.model));
    return [...set].sort();
  }, [tenantId, brand]);
  const storageOptions = useMemo(() => {
    const set = new Set(STORAGE_OPTIONS);
    store.devices.filter(d => d.tenant_id === tenantId).forEach(d => d.storage_capacity && set.add(d.storage_capacity));
    return [...set];
  }, [tenantId]);

  const errors = unitErrors(units, imei => Boolean(store.findDeviceByImei(tenantId, imei)), triedSave);
  const errorCount = Object.keys(errors).length;

  // ---- valores padrão: preenchem as linhas ainda não alteradas à mão
  const changeDefault = (field: 'cost' | 'price', value: string) => {
    const previous = field === 'cost' ? defCost : defPrice;
    (field === 'cost' ? setDefCost : setDefPrice)(value);
    setUnits(list => list.map(u => (!touched.has(`${u.id}:${field}`) && (u[field] === previous || !u[field].trim()) ? { ...u, [field]: value } : u)));
  };

  const applyToAll = (field: Field) => {
    const value = field === 'cost' ? defCost : field === 'price' ? defPrice : allColor;
    const label = field === 'cost' ? 'custo' : field === 'price' ? 'preço' : 'cor';
    if (!value.trim()) { setError(`Informe ${field === 'color' ? 'a cor' : `o ${label} padrão`} antes de aplicar a todos.`); return; }
    const run = () => {
      setUnits(list => list.map(u => ({ ...u, [field]: value })));
      setTouched(prev => new Set([...prev].filter(k => !k.endsWith(`:${field}`))));
      setAsk(null);
      setError('');
    };
    const edited = units.filter(u => touched.has(`${u.id}:${field}`) && u[field].trim() && u[field] !== value).length;
    if (edited > 0) {
      setAsk({ text: `${edited} ${edited === 1 ? 'aparelho tem' : 'aparelhos têm'} ${label} alterado individualmente. Sobrescrever com ${field === 'color' ? `"${value}"` : formatBRL(parseBRL(value) || 0)}?`, yes: run });
    } else run();
  };

  const editUnit = (index: number, field: keyof BatchUnit, value: string) => {
    setUnits(list => list.map((u, i) => (i === index ? { ...u, [field]: value } : u)));
    if (field === 'cost' || field === 'price' || field === 'color') {
      const key = `${units[index].id}:${field}`;
      setTouched(prev => new Set(prev).add(key));
    }
  };

  // ---- quantidade: aumenta sem perder nada; diminuir com linhas preenchidas pede confirmação
  const applyQuantity = (raw = qtyInput) => {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < 1) { setQtyInput(String(units.length)); return; }
    const target = Math.min(n, MAX_BATCH);
    if (n > MAX_BATCH) setError(`O lote aceita até ${MAX_BATCH} aparelhos de uma vez.`);
    setQtyInput(String(target));
    if (target > units.length) {
      setUnits(list => [...list, ...Array.from({ length: target - list.length }, () => newUnit(defCost, defPrice))]);
    } else if (target < units.length) {
      const removed = units.slice(target);
      const filled = removed.filter(u => unitHasData(u, { cost: defCost, price: defPrice })).length;
      const cut = () => { setUnits(list => list.slice(0, target)); setAsk(null); };
      if (filled > 0) {
        setAsk({
          text: `Reduzir para ${target} vai descartar ${removed.length} ${removed.length === 1 ? 'linha' : 'linhas'}, ${filled} com dados preenchidos. Descartar?`,
          yes: cut,
          no: () => { setQtyInput(String(units.length)); setAsk(null); }
        });
      } else cut();
    }
  };

  // ---- colar IMEIs
  const fillPasted = () => {
    const imeis = parseImeiList(pasteText);
    if (imeis.length === 0) { setPasteNote('Nenhum IMEI encontrado no texto colado.'); return; }
    const next = [...units];
    let k = 0;
    for (let i = 0; i < next.length && k < imeis.length; i++) {
      if (!next[i].imei.trim()) next[i] = { ...next[i], imei: imeis[k++] };
    }
    setUnits(next);
    const left = imeis.slice(k);
    if (left.length > 0) {
      setPasteText(left.join('\n'));
      setPasteNote(`${k} ${k === 1 ? 'IMEI preenchido' : 'IMEIs preenchidos'}. ${left.length === 1 ? 'Sobrou 1 IMEI sem linha vazia — ele continua' : `Sobraram ${left.length} IMEIs sem linha vazia — eles continuam`} na caixa abaixo.`);
    } else {
      setPasteText('');
      setPasteNote('');
      setPasteOpen(false);
    }
  };
  const addRowsForLeftover = () => {
    const left = parseImeiList(pasteText);
    const room = MAX_BATCH - units.length;
    const take = left.slice(0, room);
    if (take.length === 0) { setPasteNote(`O lote já tem o máximo de ${MAX_BATCH} aparelhos.`); return; }
    setUnits(list => [...list, ...take.map(imei => ({ ...newUnit(defCost, defPrice), imei }))]);
    setQtyInput(String(units.length + take.length));
    const rest = left.slice(take.length);
    setPasteText(rest.join('\n'));
    setPasteNote(rest.length ? `Limite de ${MAX_BATCH} aparelhos: ${rest.length} IMEIs não couberam e continuam na caixa.` : '');
    if (!rest.length) setPasteOpen(false);
  };

  // ---- resumo (valores individuais reais de cada linha)
  const cents = (v: string) => { const n = parseBRL(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
  const totalCost = units.reduce((a, u) => a + cents(u.cost), 0) / 100;
  const totalPrice = units.reduce((a, u) => a + cents(u.price), 0) / 100;

  const submit = async () => {
    if (saving) return;
    setTriedSave(true);
    setError('');
    if (Number(qtyInput) !== units.length) { applyQuantity(); return; }
    if (!model.trim()) { setError('Informe o modelo do aparelho.'); return; }
    if (!deviceType) { setError('Informe a condição: Seminovo ou Lacrado.'); return; }
    const strictErrors = unitErrors(units, imei => Boolean(store.findDeviceByImei(tenantId, imei)), true);
    if (Object.keys(strictErrors).length) { setError('Corrija as linhas marcadas em vermelho. Nenhum aparelho foi cadastrado.'); return; }
    setSaving(true);
    const [y, m, d] = entryDate.split('-').map(Number);
    const today = todayInput() === entryDate;
    const entry = today ? new Date() : new Date(y, (m || 1) - 1, d || 1, 12);
    const res = await store.registerDeviceBatch({
      tenantId, userId, userRole, batchId, brand, model, storage, deviceType,
      supplierId: supplierId || undefined, origin, entryDate: entry.toISOString(), units
    });
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Não foi possível cadastrar o lote.'); return; }
    onDone(res.data!.count);
  };

  const n = units.length;
  const summary = (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5">
              <span className="col-span-2 lg:col-span-4 font-extrabold uppercase tracking-wider text-[10px] text-slate-500">Resumo do cadastro</span>
              <span><span className="text-slate-500">Modelo:</span> <b>{`${brand} ${model}`.trim() || '—'}</b></span>
              <span><span className="text-slate-500">Armazenamento:</span> <b>{storage}</b></span>
              <span><span className="text-slate-500">Quantidade:</span> <b>{n} {n === 1 ? 'aparelho' : 'aparelhos'}</b></span>
              <span><span className="text-slate-500">Fornecedor:</span> <b>{store.getSupplierName(supplierId || undefined)}</b></span>
              {canSeeFinance && <>
                <span><span className="text-slate-500">Custo total:</span> <b>{formatBRL(totalCost)}</b></span>
                <span><span className="text-slate-500">Valor sugerido total:</span> <b>{formatBRL(totalPrice)}</b></span>
                <span><span className="text-slate-500">Lucro potencial bruto:</span> <b className="text-emerald-700">{formatBRL(totalPrice - totalCost)}</b></span>
              </>}
            </div>
  );

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white text-xs';
  const cell = 'w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 bg-white text-xs';
  const label = 'font-bold text-slate-700 block mb-1 text-xs';

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl animate-fade-in" role="dialog" aria-label="Cadastrar vários aparelhos">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-4 shrink-0">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" /> Cadastrar Vários Aparelhos
          </h3>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-4 sm:px-6 py-4 space-y-5 text-xs">
          {/* DADOS GERAIS DO LOTE */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className={label} htmlFor="b-brand">Marca *</label>
              <input id="b-brand" value={brand} onChange={e => setBrand(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="b-model">Modelo do aparelho *</label>
              <input id="b-model" list="b-models" value={model} onChange={e => setModel(e.target.value)} placeholder="Ex: iPhone 14 Plus" className={input} />
              <datalist id="b-models">{knownModels.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className={label} htmlFor="b-storage">Armazenamento *</label>
              <select id="b-storage" value={storage} onChange={e => setStorage(e.target.value)} className={input}>
                {storageOptions.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-qty">Quantidade de aparelhos *</label>
              <input
                id="b-qty" type="number" min={1} max={MAX_BATCH} value={qtyInput}
                onChange={e => setQtyInput(e.target.value)}
                onBlur={() => applyQuantity()}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyQuantity(); } }}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Condição *</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Condição">
                {(['seminovo', 'lacrado'] as const).map(t => (
                  <button
                    key={t} type="button" role="radio" aria-checked={deviceType === t} onClick={() => setDeviceType(t)}
                    className={`px-3 py-2 rounded-xl border font-bold ${deviceType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {t === 'seminovo' ? 'Seminovo' : 'Lacrado'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={label} htmlFor="b-supplier">Fornecedor</label>
              <select id="b-supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)} className={input}>
                <option value="">Não informado</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {suppliers.length === 0 && <p className="text-[10px] text-slate-500 mt-1">Nenhum fornecedor cadastrado. Cadastre no módulo Fornecedores para vincular.</p>}
            </div>
            <div>
              <label className={label} htmlFor="b-origin">Origem</label>
              <select id="b-origin" value={origin} onChange={e => setOrigin(e.target.value as 'purchase' | 'internal_transfer')} className={input}>
                <option value="purchase">Compra</option>
                <option value="internal_transfer">Transferência interna</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-date">Data de entrada</label>
              <input id="b-date" type="date" max={todayInput()} value={entryDate} onChange={e => setEntryDate(e.target.value || todayInput())} className={input} />
            </div>
          </section>

          {/* VALORES PADRÃO E AÇÕES EM MASSA */}
          <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor="b-cost">Custo unitário padrão (R$)</label>
              <div className="flex gap-2">
                <input id="b-cost" inputMode="decimal" value={defCost} onChange={e => changeDefault('cost', e.target.value)} placeholder="1.865,00" className={input} />
                <button type="button" onClick={() => applyToAll('cost')} className="shrink-0 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100">Aplicar Custo a Todos</button>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="b-price">Preço sugerido padrão (R$)</label>
              <div className="flex gap-2">
                <input id="b-price" inputMode="decimal" value={defPrice} onChange={e => changeDefault('price', e.target.value)} placeholder="2.000,00" className={input} />
                <button type="button" onClick={() => applyToAll('price')} className="shrink-0 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100">Aplicar Preço a Todos</button>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="b-color">Cor</label>
              <div className="flex gap-2">
                <input id="b-color" value={allColor} onChange={e => setAllColor(e.target.value)} placeholder="Ex: Azul" className={input} />
                <button type="button" onClick={() => applyToAll('color')} className="shrink-0 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100">Aplicar Cor a Todos</button>
              </div>
            </div>
          </section>

          {ask && (
            <div role="alertdialog" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-amber-800 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" />{ask.text}</span>
              <span className="flex gap-2 shrink-0">
                <button type="button" onClick={() => (ask.no ? ask.no() : setAsk(null))} className="px-3 py-1.5 rounded-xl font-semibold text-slate-600 hover:bg-white">Cancelar</button>
                <button type="button" onClick={ask.yes} className="px-3 py-1.5 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700">Confirmar</button>
              </span>
            </div>
          )}

          {/* UNIDADES */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">Aparelhos do lote ({n})</span>
              <button type="button" onClick={() => { setPasteOpen(o => !o); setPasteNote(''); }} className="px-3 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5" /> Colar IMEIs
              </button>
            </div>

            {pasteOpen && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                <label htmlFor="b-paste" className="font-semibold text-slate-700 block">Cole os IMEIs (um por linha, ou separados por vírgula ou tabulação). Eles entram nas linhas ainda sem IMEI.</label>
                <textarea id="b-paste" rows={4} value={pasteText} onChange={e => setPasteText(e.target.value)} className={`${input} font-mono`} />
                {pasteNote && <p className="font-semibold text-amber-700">{pasteNote}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                  {pasteNote && parseImeiList(pasteText).length > 0 && (
                    <button type="button" onClick={addRowsForLeftover} className="px-3 py-1.5 rounded-xl border border-blue-300 bg-white font-semibold text-blue-700">
                      Adicionar {parseImeiList(pasteText).length} {parseImeiList(pasteText).length === 1 ? 'linha' : 'linhas'} para os restantes
                    </button>
                  )}
                  <button type="button" onClick={fillPasted} className="px-3 py-1.5 rounded-xl font-bold btn-tenant-primary">Preencher linhas</button>
                </div>
              </div>
            )}

            <div className="hidden sm:grid grid-cols-[28px_minmax(150px,1.6fr)_minmax(100px,1fr)_80px_minmax(100px,1fr)_minmax(100px,1fr)] gap-2 px-2 text-[10px] font-bold uppercase text-slate-400">
              <span>#</span><span>IMEI</span><span>Cor</span><span>Bateria</span><span>Custo (R$)</span><span>Preço (R$)</span>
            </div>
            <ol className="space-y-2 sm:space-y-1">
              {units.map((u, i) => (
                <li key={u.id} className={`rounded-2xl sm:rounded-xl border p-3 sm:p-2 ${errors[i] ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-[28px_minmax(150px,1.6fr)_minmax(100px,1fr)_80px_minmax(100px,1fr)_minmax(100px,1fr)] gap-2 items-center">
                    <span className="col-span-2 sm:col-span-1 font-bold text-slate-500">
                      <span className="sm:hidden">Aparelho </span>{i + 1}
                    </span>
                    <label className="col-span-2 sm:col-span-1">
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">IMEI</span>
                      <input aria-label={`IMEI do aparelho ${i + 1}`} inputMode="numeric" value={u.imei} onChange={e => editUnit(i, 'imei', e.target.value)} placeholder="15 dígitos" className={`${cell} font-mono`} />
                    </label>
                    <label>
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Cor</span>
                      <input aria-label={`Cor do aparelho ${i + 1}`} value={u.color} onChange={e => editUnit(i, 'color', e.target.value)} className={cell} />
                    </label>
                    <label>
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Bateria (%)</span>
                      <input aria-label={`Bateria do aparelho ${i + 1}`} inputMode="numeric" value={u.battery} onChange={e => editUnit(i, 'battery', e.target.value)} placeholder={deviceType === 'lacrado' ? 'opcional' : '%'} className={cell} />
                    </label>
                    <label>
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Custo (R$)</span>
                      <input aria-label={`Custo do aparelho ${i + 1}`} inputMode="decimal" value={u.cost} onChange={e => editUnit(i, 'cost', e.target.value)} className={cell} />
                    </label>
                    <label>
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Preço (R$)</span>
                      <input aria-label={`Preço do aparelho ${i + 1}`} inputMode="decimal" value={u.price} onChange={e => editUnit(i, 'price', e.target.value)} className={cell} />
                    </label>
                  </div>
                  {errors[i] && <p className="mt-1 sm:pl-9 text-[11px] font-semibold text-rose-600">{errors[i]}</p>}
                </li>
              ))}
            </ol>
          </section>

          {/* no celular o resumo rola junto, para sobrar espaço às unidades */}
          <div className="sm:hidden">{summary}</div>
        </div>

        {/* RESUMO E CONFIRMAÇÃO */}
        <div className="shrink-0 border-t border-slate-100 px-4 sm:px-6 py-4 space-y-3 text-xs">
          <div className="hidden sm:block">{summary}</div>
          {error && <p role="alert" className="font-semibold text-rose-600">{error}</p>}
          {!error && errorCount > 0 && <p className="font-semibold text-rose-600">{errorCount} {errorCount === 1 ? 'linha precisa' : 'linhas precisam'} de correção.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
            <button type="button" onClick={submit} disabled={saving} className="btn-tenant-primary px-5 py-2 rounded-xl font-bold disabled:opacity-60">
              {saving ? 'Cadastrando...' : `CADASTRAR ${n} ${n === 1 ? 'APARELHO' : 'APARELHOS'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
