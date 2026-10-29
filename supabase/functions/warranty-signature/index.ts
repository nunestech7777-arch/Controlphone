// ============================================================================
// CONTROLPHONE — COMPROVANTE DE GARANTIA COM RUBRICA DIGITAL (SUPABASE EDGE FUNCTION)
//
// Usada só pelo envio do Termo de Garantia por WhatsApp:
//   - prepare (usuário da loja, logado): guarda o PDF original gerado pela tela e o
//     resumo do comprovante, cria o token do link e devolve o token. O banco guarda
//     só o hash do token. Reenviar enquanto o cliente não confirmou troca o token:
//     o link anterior deixa de funcionar.
//   - get / pdf (públicos, pelo token): resumo do comprovante para a página do cliente
//     e o PDF original. Nada de custos, lucros ou ids internos.
//   - sign (público, pelo token): recebe a rubrica (PNG), incorpora a rubrica no PDF
//     no servidor (o navegador do cliente não monta o documento final), grava o PDF
//     assinado e marca a confirmação com data e hora. Uma confirmação por link: o
//     registro é travado (status "signing") antes de qualquer gravação, e o banco
//     não deixa alterar um comprovante confirmado (migration 28).
//
// Erros de regra voltam com HTTP 200 e { ok: false, error } para a tela exibir.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'warranty-receipts';
const DOCUMENT_ID = 'warranty-term';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 600 * 1024;
const MAX_SNAPSHOT_CHARS = 120_000;
// Confirmação interrompida (queda da função no meio): depois disso o link volta a aceitar a rubrica
const STALE_SIGNING_MS = 2 * 60 * 1000;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Json = Record<string, unknown>;

class Refusal extends Error {}
const refuse = (message: string): never => {
  throw new Refusal(message);
};

const reply = (body: Json) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (data: Uint8Array | string) =>
  toHex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Só 0-9 e a-f (256 bits): o WhatsApp corta a parte clicável de links em "-" e "_"
function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

const readToken = (v: unknown) => {
  const token = text(v);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) refuse('Link inválido ou expirado.');
  return token;
};

// ---------------------------------------------------------------------------
// QUEM CHAMA (prepare): mesmo critério das vendas (tenant_record_allowed('sales', ...))
// ---------------------------------------------------------------------------
async function getStaff(req: Request, requestedTenant: unknown): Promise<{ id: string; tenantId: string }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) refuse('Sessão expirada. Entre novamente.');
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) refuse('Sessão expirada. Entre novamente.');

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, tenant_id, is_active')
    .eq('id', data.user!.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) refuse('Usuário sem permissão.');
  if (!['admin', 'seller', 'super_admin'].includes(profile!.role)) refuse('Seu perfil não pode enviar comprovantes de venda.');

  const tenantId = profile!.role === 'super_admin' ? text(requestedTenant) : String(profile!.tenant_id || '');
  if (!isUuid(tenantId)) refuse('Loja não identificada.');
  return { id: profile!.id, tenantId };
}

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------
async function prepare(req: Request, body: Json): Promise<Json> {
  const staff = await getStaff(req, body.tenant_id);
  const saleId = text(body.sale_id);
  if (!saleId || saleId.length > 200) refuse('Venda não identificada.');

  const snapshot = body.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) refuse('Dados do comprovante ausentes.');
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_CHARS) refuse('Comprovante grande demais.');

  const pdfB64 = text(body.pdf_base64);
  if (!pdfB64) refuse('PDF do comprovante ausente.');
  const pdf = base64ToBytes(pdfB64);
  if (pdf.length > MAX_PDF_BYTES) refuse('PDF do comprovante grande demais.');
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') refuse('Arquivo do comprovante inválido.');

  // A venda precisa estar gravada no banco, na loja de quem envia
  const { data: saleRow } = await db
    .from('tenant_records')
    .select('data')
    .eq('tenant_id', staff.tenantId).eq('kind', 'sales').eq('id', saleId)
    .maybeSingle();
  if (!saleRow) refuse('A venda ainda não foi enviada ao servidor. Aguarde a sincronização e tente de novo.');
  const sale = saleRow!.data as Json;

  const { data: existing } = await db
    .from('warranty_signatures')
    .select('id, status, updated_at')
    .eq('tenant_id', staff.tenantId).eq('sale_id', saleId).eq('document_id', DOCUMENT_ID)
    .maybeSingle();
  if (existing?.status === 'signed') refuse('O cliente já confirmou este comprovante. Ele está em Detalhes da Venda > Comprovante de Garantia.');
  const signingNow = existing?.status === 'signing' && Date.now() - new Date(existing.updated_at).getTime() < STALE_SIGNING_MS;
  if (signingNow) refuse('O cliente está confirmando o comprovante neste momento. Tente de novo em instantes.');

  const token = newToken();
  const path = `${staff.tenantId}/${saleId}/original-${Date.now()}.pdf`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (upErr) {
    console.error(upErr);
    refuse('Não foi possível guardar o comprovante. Tente de novo.');
  }

  const row = {
    tenant_id: staff.tenantId,
    sale_id: saleId,
    sale_number: Number(sale.sale_number) || null,
    customer_id: text(sale.customer_id) || null,
    document_id: DOCUMENT_ID,
    token_hash: await sha256(token),
    status: 'pending',
    snapshot,
    original_pdf_path: path,
    original_pdf_sha256: await sha256(pdf),
    link_sent_at: new Date().toISOString(),
    created_by: staff.id
  };
  const { error } = existing
    // reenvio: novo token (o link anterior para de funcionar) e o PDF com os dados atuais
    ? await db.from('warranty_signatures').update(row).eq('id', existing.id).neq('status', 'signed')
    : await db.from('warranty_signatures').insert(row);
  if (error) {
    console.error(error);
    await db.storage.from(BUCKET).remove([path]);
    refuse('Não foi possível gerar o link do comprovante. Tente de novo.');
  }
  return { token };
}

// ---------------------------------------------------------------------------
// get / sign (públicos, pelo token)
// ---------------------------------------------------------------------------
async function findByToken(token: string) {
  const { data } = await db
    .from('warranty_signatures')
    .select('id, tenant_id, sale_id, status, snapshot, signed_at, original_pdf_path, original_pdf_sha256')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!data) refuse('Link inválido ou expirado. Peça à loja um novo link.');
  return data!;
}

async function getPublic(body: Json): Promise<Json> {
  const row = await findByToken(readToken(body.token));
  return { status: row.status === 'signed' ? 'signed' : 'pending', signed_at: row.signed_at, snapshot: row.snapshot };
}

// PDF original entregue pelo próprio token: um link do Storage mostraria o caminho (ids da loja e da venda)
async function getPublicPdf(body: Json): Promise<Json> {
  const row = await findByToken(readToken(body.token));
  if (row.status === 'signed') refuse('Este comprovante já foi confirmado.');
  const { data: file } = await db.storage.from(BUCKET).download(row.original_pdf_path);
  if (!file) refuse('Comprovante indisponível. Peça à loja um novo link.');
  const bytes = new Uint8Array(await file!.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pdf_base64: btoa(bin) };
}

// Fontes padrão do PDF só escrevem Latin-1 (WinAnsi): o resto vira equivalente simples
const latin = (s: unknown) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

const whenBR = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));

async function stampPdf(original: Uint8Array, png: Uint8Array, info: {
  snapshot: Json; signedAt: string; originalHash: string; ip: string; userAgent: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const image = await pdf.embedPng(png);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.39, 0.45, 0.55);
  const dark = rgb(0.06, 0.09, 0.16);

  // Rubrica no canto inferior direito de cada página do comprovante
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const w = 70;
    const h = Math.min(30, (image.height / image.width) * w);
    page.drawImage(image, { x: width - w - 24, y: 22, width: w, height: h });
    page.drawText('Rubrica do cliente', { x: width - w - 24, y: 14, size: 6.5, font, color: gray });
  }

  // Página final com o registro da confirmação
  const snap = info.snapshot as {
    store?: { name?: string }; sale?: { number?: number | string; date?: string };
    customer?: { name?: string; document?: string };
    devices?: { description?: string; imei?: string }[];
  };
  const page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const line = (label: string, value: string) => {
    page.drawText(latin(label), { x: 56, y, size: 10, font: bold, color: dark });
    page.drawText(latin(value).slice(0, 90), { x: 200, y, size: 10, font, color: dark });
    y -= 18;
  };
  page.drawText('REGISTRO DE CONFIRMAÇÃO DO COMPROVANTE DE GARANTIA', { x: 56, y, size: 12.5, font: bold, color: dark });
  y -= 30;
  line('Loja:', snap.store?.name || '-');
  line('Venda nº:', String(snap.sale?.number ?? '-'));
  line('Cliente:', snap.customer?.name || '-');
  if (snap.customer?.document) line('CPF:', snap.customer.document);
  (snap.devices || []).slice(0, 6).forEach(d => line('Aparelho:', `${d.description || ''} - IMEI ${d.imei || '-'}`));
  line('Confirmado em:', `${whenBR(info.signedAt)} (horário de Brasília)`);
  line('Data/hora UTC:', info.signedAt);
  line('Endereço IP:', info.ip || '-');

  y -= 14;
  page.drawText('Rubrica digital do cliente:', { x: 56, y, size: 10, font: bold, color: dark });
  const sigW = 260;
  const sigH = Math.min(130, (image.height / image.width) * sigW);
  y -= sigH + 8;
  page.drawRectangle({ x: 56, y: y - 4, width: sigW + 8, height: sigH + 8, borderColor: rgb(0.8, 0.84, 0.88), borderWidth: 0.8 });
  page.drawImage(image, { x: 60, y, width: sigW, height: sigH });
  y -= 30;

  const small = (s: string) => {
    page.drawText(latin(s), { x: 56, y, size: 7.5, font, color: gray, maxWidth: 483, lineHeight: 10 });
    y -= 12;
  };
  small('O cliente acessou o comprovante pelo link individual enviado pela loja, conferiu o documento,');
  small('fez a rubrica na tela e confirmou. A data e a hora acima são registradas pelo servidor.');
  small(`Hash SHA-256 do comprovante original: ${info.originalHash}`);
  small(`Navegador: ${info.userAgent.slice(0, 110)}`);

  pdf.setTitle(latin(`Comprovante de Garantia - Venda ${snap.sale?.number ?? ''} (confirmado)`));
  pdf.setModificationDate(new Date(info.signedAt));
  return await pdf.save();
}

async function sign(req: Request, body: Json): Promise<Json> {
  const token = readToken(body.token);
  const raw = text(body.signature);
  const match = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) refuse('Faça a rubrica no campo indicado antes de confirmar.');
  const png = base64ToBytes(match![1]);
  if (png.length < 200 || png.length > MAX_SIGNATURE_BYTES) refuse('Rubrica inválida. Limpe o campo e faça de novo.');
  if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) refuse('Rubrica inválida. Limpe o campo e faça de novo.');

  // Trava o registro antes de gravar qualquer coisa: só uma confirmação por link
  const tokenHash = await sha256(token);
  const { data: claimed } = await db
    .from('warranty_signatures')
    .update({ status: 'signing' })
    .eq('token_hash', tokenHash)
    .or(`status.eq.pending,and(status.eq.signing,updated_at.lt.${new Date(Date.now() - STALE_SIGNING_MS).toISOString()})`)
    .select('id, tenant_id, sale_id, snapshot, original_pdf_path, original_pdf_sha256')
    .maybeSingle();
  if (!claimed) {
    const row = await findByToken(token);
    if (row.status === 'signed') return { ok: false, already_signed: true, signed_at: row.signed_at, error: 'Este comprovante já foi confirmado.' };
    refuse('O comprovante está sendo confirmado. Aguarde alguns segundos e atualize a página.');
  }
  const row = claimed!;
  const stamp = Date.now();
  const base = `${row.tenant_id}/${row.sale_id}`;
  const signaturePath = `${base}/rubrica-${stamp}.png`;
  const signedPath = `${base}/comprovante-assinado-${stamp}.pdf`;

  try {
    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(row.original_pdf_path);
    if (dlErr || !file) throw new Error(`original: ${dlErr?.message}`);
    const original = new Uint8Array(await file.arrayBuffer());
    if ((await sha256(original)) !== row.original_pdf_sha256) throw new Error('hash do original divergente');

    const signedAt = new Date().toISOString();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300);
    const signed = await stampPdf(original, png, {
      snapshot: row.snapshot as Json, signedAt, originalHash: row.original_pdf_sha256, ip, userAgent
    });

    const up1 = await db.storage.from(BUCKET).upload(signaturePath, png, { contentType: 'image/png', upsert: false });
    if (up1.error) throw new Error(`rubrica: ${up1.error.message}`);
    const up2 = await db.storage.from(BUCKET).upload(signedPath, signed, { contentType: 'application/pdf', upsert: false });
    if (up2.error) throw new Error(`pdf assinado: ${up2.error.message}`);

    const { error } = await db
      .from('warranty_signatures')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signature_path: signaturePath,
        signed_pdf_path: signedPath,
        signed_pdf_sha256: await sha256(signed),
        signer_ip: ip || null,
        signer_user_agent: userAgent || null
      })
      .eq('id', row.id).eq('status', 'signing');
    if (error) throw new Error(`registro: ${error.message}`);
    return { signed_at: signedAt };
  } catch (err) {
    console.error(err);
    await db.storage.from(BUCKET).remove([signaturePath, signedPath]);
    await db.from('warranty_signatures').update({ status: 'pending' }).eq('id', row.id).eq('status', 'signing');
    refuse('Não foi possível salvar a confirmação. Tente de novo.');
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    switch (text(body.action)) {
      case 'prepare':
        return reply({ ok: true, ...(await prepare(req, body)) });
      case 'get':
        return reply({ ok: true, ...(await getPublic(body)) });
      case 'pdf':
        return reply({ ok: true, ...(await getPublicPdf(body)) });
      case 'sign':
        return reply({ ok: true, ...(await sign(req, body)) });
      default:
        return reply({ ok: false, error: 'Ação desconhecida.' });
    }
  } catch (err) {
    if (err instanceof Refusal) return reply({ ok: false, error: err.message });
    console.error(err);
    return reply({ ok: false, error: 'Erro inesperado no servidor. Tente de novo.' });
  }
});
