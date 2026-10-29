// ============================================================================
// CONTROLPHONE — PÁGINA PÚBLICA DO COMPROVANTE DE GARANTIA (/garantia/<token>)
// Aberta pelo cliente a partir do link enviado por WhatsApp, sem login: confere o
// comprovante, faz a rubrica com o dedo (ou mouse) e confirma. O PDF final com a
// rubrica é montado no servidor (função edge "warranty-signature").
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, FileText, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PublicReceipt, confirmPublicReceipt, loadPublicReceipt, loadPublicReceiptPdf } from '../../lib/warrantySignaturePublic';

const day = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const boxCls = 'bg-slate-50 rounded-xl p-3 border border-slate-100';
const cardCls = 'bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5';

const SUCCESS = 'Comprovante de garantia confirmado com sucesso! Sua rubrica foi registrada.';

// Cor da loja nos botões, como no sistema
function applyStoreColor(hex?: string) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', hex);
  root.style.setProperty('--tenant-button', hex);
  root.style.setProperty('--tenant-button-rgb', rgb);
  root.style.setProperty('--tenant-primary-rgb', rgb);
}

// ---------------------------------------------------------------------------
// Campo de rubrica (canvas): dedo, caneta ou mouse
// ---------------------------------------------------------------------------
interface SignaturePadHandle { clear: () => void; toPng: () => string | null }

const SignaturePad: React.FC<{ onChange: (empty: boolean) => void; disabled?: boolean; padRef: React.MutableRefObject<SignaturePadHandle | null> }> = ({
  onChange, disabled, padRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0f172a';
    strokes.current = 0;
    onChange(true);
  }, [onChange]);

  useEffect(() => {
    setup();
    // girar o celular muda a largura do campo: recomeça a rubrica para não distorcer.
    // (a barra de endereço do celular também dispara "resize" ao rolar, sem mudar a largura)
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      setup();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setup]);

  useEffect(() => {
    padRef.current = {
      clear: setup,
      toPng: () => {
        const canvas = canvasRef.current;
        if (!canvas || strokes.current === 0) return null;
        // reduz para no máximo 800 px de largura: arquivo leve, nitidez suficiente no PDF
        const scale = Math.min(1, 800 / canvas.width);
        const out = document.createElement('canvas');
        out.width = Math.round(canvas.width * scale);
        out.height = Math.round(canvas.height * scale);
        out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height);
        return out.toDataURL('image/png');
      }
    };
  });

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    strokes.current += 1;
    onChange(false);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      aria-label="Campo de rubrica digital"
      className={`w-full h-44 sm:h-48 rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none select-none ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
      style={{ touchAction: 'none' }}
    />
  );
};

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export const WarrantySignPage: React.FC<{ token: string }> = ({ token }) => {
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [loadError, setLoadError] = useState('');
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const onPadChange = useCallback((isEmpty: boolean) => setEmpty(isEmpty), []);

  useEffect(() => {
    document.title = 'Comprovante de Garantia';
    let active = true;
    void loadPublicReceipt(token).then(result => {
      if (!active) return;
      if (!result.ok) { setLoadError(result.error); return; }
      setReceipt(result);
      applyStoreColor(result.snapshot.store.primary_color);
      if (result.status === 'signed') { setAlreadySigned(true); setDoneAt(result.signed_at || null); }
    });
    return () => { active = false; };
  }, [token]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const openPdf = async () => {
    if (pdfBusy) return;
    // aberta antes da consulta para não ser bloqueada como pop-up no celular
    const tab = window.open('', '_blank');
    setPdfBusy(true);
    const result = await loadPublicReceiptPdf(token);
    setPdfBusy(false);
    if (!result.ok) { tab?.close(); setError(result.error); return; }
    const bytes = Uint8Array.from(atob(result.pdf_base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
  };

  const confirm = async () => {
    if (saving) return;
    const png = padRef.current?.toPng();
    if (!png) { setError('Faça sua rubrica no campo acima antes de confirmar.'); return; }
    setSaving(true);
    setError('');
    const result = await confirmPublicReceipt(token, png);
    setSaving(false);
    if (result.ok) { setDoneAt(result.signed_at); return; }
    if (result.already_signed) { setAlreadySigned(true); setDoneAt(result.signed_at || null); return; }
    setError(result.error);
  };

  if (loadError) {
    return (
      <Shell>
        <div className={`${cardCls} text-center space-y-3`}>
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="font-bold text-slate-800">{loadError}</p>
        </div>
      </Shell>
    );
  }

  if (!receipt) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando comprovante...
        </div>
      </Shell>
    );
  }

  const s = receipt.snapshot;

  if (doneAt !== null || alreadySigned) {
    return (
      <Shell>
        <StoreHeader receipt={receipt} />
        <div className={`${cardCls} text-center space-y-3`}>
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <p className="font-bold text-slate-800 text-base">
            {alreadySigned ? 'Este comprovante de garantia já foi confirmado.' : SUCCESS}
          </p>
          {doneAt && <p className="text-xs text-slate-500">Confirmado em {dateTime(doneAt)}.</p>}
          <p className="text-xs text-slate-500">Venda nº {s.sale.number} · {s.store.name}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <StoreHeader receipt={receipt} />

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-slate-800 text-sm">Comprovante de Garantia — Venda nº {s.sale.number}</h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className={boxCls}><span className={labelCls}>Data da venda</span><span className="font-semibold text-slate-800">{dateTime(s.sale.date)}</span></div>
          <div className={boxCls}><span className={labelCls}>Vendedor</span><span className="font-semibold text-slate-800">{s.sale.seller}</span></div>
          <div className={`${boxCls} col-span-2`}>
            <span className={labelCls}>Cliente</span>
            <span className="font-semibold text-slate-800">{s.customer.name}</span>
            {s.customer.document && <span className="block text-slate-500 mt-0.5">CPF {s.customer.document}</span>}
          </div>
        </div>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-bold text-slate-800 text-sm">Aparelho e garantia</h2>
        {s.devices.map((d, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
            <div className="font-bold text-slate-800">{d.description}{d.color ? ` · ${d.color}` : ''}</div>
            <div className="font-mono text-slate-600 break-all">IMEI {d.imei}</div>
            <div className="grid grid-cols-3 gap-2">
              <div className={boxCls}><span className={labelCls}>Prazo</span><span className="font-bold text-slate-800">{d.warranty_days ? `${d.warranty_days} dias` : '—'}</span></div>
              <div className={boxCls}><span className={labelCls}>Início</span><span className="font-semibold text-slate-800">{day(d.start_date)}</span></div>
              <div className={boxCls}><span className={labelCls}>Término</span><span className="font-semibold text-slate-800">{day(d.end_date)}</span></div>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-slate-400">{s.notice}</p>
      </section>

      <section className={`${cardCls} space-y-4`}>
        <h2 className="font-bold text-slate-800 text-sm">Condições da garantia</h2>
        {s.conditions.map(c => (
          <div key={c.title} className="space-y-1.5">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">{c.title}</h3>
            {c.paragraphs.map((p, i) => <p key={i} className="text-xs text-slate-600 leading-relaxed">{p}</p>)}
          </div>
        ))}
        <button
          type="button"
          onClick={openPdf}
          disabled={pdfBusy}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Abrir comprovante completo (PDF)
        </button>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div>
          <h2 className="font-bold text-slate-800 text-sm">Rubrica digital</h2>
          <p className="text-xs text-slate-500 mt-0.5">Faça sua rubrica com o dedo no campo abaixo para confirmar que conferiu o comprovante.</p>
        </div>
        <SignaturePad padRef={padRef} onChange={onPadChange} disabled={saving} />
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { padRef.current?.clear(); setError(''); }}
            disabled={saving || empty}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Eraser className="w-4 h-4" /> Limpar rubrica
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || empty}
            className="btn-tenant-primary px-4 py-3 rounded-xl font-bold text-xs inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Confirmar e salvar'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">A data e a hora da confirmação ficam registradas junto da rubrica.</p>
      </section>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-surface font-sans">
    <main className="max-w-xl mx-auto px-4 py-6 space-y-4">{children}</main>
  </div>
);

const StoreHeader: React.FC<{ receipt: PublicReceipt }> = ({ receipt }) => {
  const st = receipt.snapshot.store;
  return (
    <header className={`${cardCls} flex items-center gap-3`}>
      {st.logo_url
        ? <img src={st.logo_url} alt="" className="w-12 h-12 object-contain rounded-xl shrink-0" />
        : <div className="w-12 h-12 rounded-xl bg-tenant-primary text-white flex items-center justify-center font-bold shrink-0">{st.name.slice(0, 1)}</div>}
      <div className="min-w-0">
        <h1 className="font-bold text-slate-800 truncate">{st.name}</h1>
        {st.address && <p className="text-[11px] text-slate-500">{st.address}</p>}
        <p className="text-[11px] text-slate-500">{[st.phone && `Tel: ${st.phone}`, st.cnpj && `CNPJ ${st.cnpj}`].filter(Boolean).join(' · ')}</p>
      </div>
    </header>
  );
};

export default WarrantySignPage;
