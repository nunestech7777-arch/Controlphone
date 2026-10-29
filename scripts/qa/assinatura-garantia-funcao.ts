// Função edge "warranty-signature" rodando no Node com um Supabase falso em memória:
// quem pode gerar o link, token só como hash, página pública sem dados internos, rubrica
// obrigatória, PDF final montado no servidor com a rubrica, confirmação única (inclusive
// com duas confirmações ao mesmo tempo), reenvio troca o link e original adulterado é recusado.
// Uso: sh scripts/qa/rodar.sh assinatura-garantia-funcao
import { served } from './shims/deno';
import { fake } from './shims/fake-supabase';
import '../../supabase/functions/warranty-signature/index.ts';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
fake.tables.profiles = [
  { id: 'u-admin', role: 'admin', tenant_id: A, is_active: true },
  { id: 'u-seller', role: 'seller', tenant_id: A, is_active: true },
  { id: 'u-tech', role: 'technician', tenant_id: A, is_active: true },
  { id: 'u-off', role: 'seller', tenant_id: A, is_active: false },
  { id: 'u-adminB', role: 'admin', tenant_id: B, is_active: true }
];
['admin', 'seller', 'tech', 'off', 'adminB'].forEach(u => fake.users.set(`jwt-${u}`, `u-${u}`));
fake.tables.tenant_records = [
  { tenant_id: A, kind: 'sales', id: 'sale-A-1', data: { id: 'sale-A-1', sale_number: 1001, customer_id: 'cust-1', total_cost: 3000, gross_profit: 900 } },
  { tenant_id: A, kind: 'sales', id: 'sale-A-2', data: { id: 'sale-A-2', sale_number: 1002, customer_id: 'cust-2' } }
];

const call = async (body: Record<string, unknown>, jwt?: string, ip = '200.1.2.3') => {
  const res = await served.handler!(new Request('https://fn/warranty-signature', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'QA iPhone', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body)
  }));
  return res.json() as Promise<any>;
};

// PDF de verdade (como o da tela) e uma rubrica PNG de verdade
const pdfDoc = new jsPDF();
pdfDoc.text('TERMO DE GARANTIA - Venda 1001', 20, 20);
pdfDoc.addPage();
pdfDoc.text('Página 2', 20, 20);
const pdfBytes = new Uint8Array(pdfDoc.output('arraybuffer'));
const pdfB64 = Buffer.from(pdfBytes).toString('base64');

function png(w: number, h: number): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 4 + 1) + 1 + x * 4;
    if (Math.abs(y - h / 2 - Math.sin(x / 9) * h / 4) < 2) { raw[i + 3] = 255; } // traço da rubrica
  }
  return 'data:image/png;base64,' + Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]).toString('base64');
}
const rubrica = png(300, 120);

const snapshot = {
  store: { name: 'Loja Alfa', phone: '11 9999-0000' },
  sale: { number: 1001, date: '2026-10-28T12:00:00Z', seller: 'Vendedor A' },
  customer: { name: 'João da Silva', document: '***.456.789-**' },
  devices: [{ description: 'Apple iPhone 13 128GB', color: 'Azul', imei: '350000000000011', warranty_days: 90, start_date: '2026-10-28', end_date: '2027-01-26' }],
  conditions: [{ title: '1) Da abrangência', paragraphs: ['Texto'] }],
  notice: 'CDC'
};
const prepareBody = (sale = 'sale-A-1') => ({ action: 'prepare', sale_id: sale, snapshot, pdf_base64: pdfB64 });
const rows = () => fake.tables.warranty_signatures || [];

// ---- quem pode gerar o link
check('sem login: recusado', (await call(prepareBody())).ok === false);
check('técnico: recusado', (await call(prepareBody(), 'jwt-tech')).ok === false);
check('usuário desativado: recusado', (await call(prepareBody(), 'jwt-off')).ok === false);
check('venda de outra loja (admin B): recusado', (await call(prepareBody(), 'jwt-adminB')).ok === false);
check('venda ainda não sincronizada: recusado', (await call(prepareBody('sale-A-9'), 'jwt-seller')).ok === false);
check('arquivo que não é PDF: recusado', (await call({ ...prepareBody(), pdf_base64: Buffer.from('oi').toString('base64') }, 'jwt-seller')).ok === false);
check('nenhum registro criado pelas tentativas recusadas', rows().length === 0);

const first = await call(prepareBody(), 'jwt-seller');
check('vendedor da loja gera o link', first.ok === true && typeof first.token === 'string' && first.token.length >= 40, JSON.stringify(first));
const token1 = first.token as string;
const row = rows()[0];
check('banco guarda só o hash do token', row.token_hash === createHash('sha256').update(token1).digest('hex') && !JSON.stringify(row).includes(token1));
check('registro vinculado à venda e ao cliente', row.tenant_id === A && row.sale_id === 'sale-A-1' && row.sale_number === 1001 && row.customer_id === 'cust-1');
check('PDF original guardado na pasta da loja', fake.files.has(`warranty-receipts/${row.original_pdf_path}`) && row.original_pdf_path.startsWith(`${A}/sale-A-1/`));

// ---- página pública
const bad = await call({ action: 'get', token: 'x'.repeat(43) });
check('token inexistente: link inválido', bad.ok === false && /inválido/.test(bad.error));
check('token mal formado: link inválido', (await call({ action: 'get', token: '../../etc' })).ok === false);
const pub = await call({ action: 'get', token: token1 });
check('página pública: aguardando', pub.ok && pub.status === 'pending');
const pubPdf = await call({ action: 'pdf', token: token1 });
check('PDF original entregue pelo token, idêntico ao enviado', pubPdf.ok && Buffer.from(pubPdf.pdf_base64, 'base64').equals(Buffer.from(pdfBytes)));
const pubText = JSON.stringify(pub) + JSON.stringify(Object.keys(pubPdf));
check('página pública não expõe ids internos nem custos', !pubText.includes(A) && !pubText.includes('sale-A-1') && !pubText.includes('cust-1') && !/total_cost|gross_profit|token_hash/.test(pubText));

// ---- reenvio troca o link
const second = await call(prepareBody(), 'jwt-admin');
check('reenvio gera outro token', second.ok && second.token !== token1);
check('um único registro por venda', rows().filter(r => r.sale_id === 'sale-A-1').length === 1);
check('link anterior deixa de funcionar', (await call({ action: 'get', token: token1 })).ok === false);
const token = second.token as string;

// ---- rubrica obrigatória e válida
check('confirmar sem rubrica: recusado', (await call({ action: 'sign', token, signature: '' })).ok === false);
check('rubrica que não é PNG: recusada', (await call({ action: 'sign', token, signature: 'data:image/png;base64,' + Buffer.from('x'.repeat(300)).toString('base64') })).ok === false);
check('continua aguardando', rows()[0].status === 'pending');

// ---- duas confirmações ao mesmo tempo: só uma vale
const [s1, s2] = await Promise.all([
  call({ action: 'sign', token, signature: rubrica }),
  call({ action: 'sign', token, signature: rubrica })
]);
const oks = [s1, s2].filter(r => r.ok).length;
check('duas confirmações simultâneas: exatamente uma grava', oks === 1, JSON.stringify([s1, s2]));
const signed = rows()[0];
check('status confirmado com data e hora', signed.status === 'signed' && !Number.isNaN(Date.parse(signed.signed_at)));
check('IP e navegador registrados como evidência', signed.signer_ip === '200.1.2.3' && signed.signer_user_agent === 'QA iPhone');
const signedPdf = fake.files.get(`warranty-receipts/${signed.signed_pdf_path}`)!;
check('PDF assinado e rubrica guardados', Boolean(signedPdf) && fake.files.has(`warranty-receipts/${signed.signature_path}`));
check('hash do PDF assinado registrado', signed.signed_pdf_sha256 === createHash('sha256').update(signedPdf).digest('hex'));
// QA_SALVAR_PDF=/caminho/arquivo.pdf grava o PDF assinado para conferir visualmente
if (process.env.QA_SALVAR_PDF) writeFileSync(process.env.QA_SALVAR_PDF, signedPdf);
const loaded = await PDFDocument.load(signedPdf);
check('PDF assinado = páginas do original + página de confirmação', loaded.getPageCount() === 3, String(loaded.getPageCount()));
check('rubrica incorporada em cada página (imagem no PDF)', (Buffer.from(signedPdf).toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 1);
const files = [...fake.files.keys()].filter(k => k.includes('comprovante-assinado'));
check('nenhum arquivo duplicado da confirmação recusada', files.length === 1, files.join(','));

// ---- depois de confirmado
const again = await call({ action: 'sign', token, signature: rubrica });
check('nova rubrica pelo mesmo link: recusada como já confirmado', again.ok === false && again.already_signed === true);
const pubAfter = await call({ action: 'get', token });
check('página mostra confirmado', pubAfter.ok && pubAfter.status === 'signed' && pubAfter.signed_at === signed.signed_at);
check('PDF original não é mais entregue depois de confirmado', (await call({ action: 'pdf', token })).ok === false);
check('reenviar venda já confirmada: recusado', (await call(prepareBody(), 'jwt-seller')).ok === false);
check('registro confirmado não mudou', rows()[0].signed_at === signed.signed_at && rows()[0].token_hash === signed.token_hash);

// ---- original adulterado no armazenamento: não assina e volta a aguardar
const other = await call(prepareBody('sale-A-2'), 'jwt-seller');
const r2 = rows().find(r => r.sale_id === 'sale-A-2')!;
fake.files.set(`warranty-receipts/${r2.original_pdf_path}`, new Uint8Array([...pdfBytes, 32]));
const tampered = await call({ action: 'sign', token: other.token, signature: rubrica });
check('original adulterado: confirmação recusada', tampered.ok === false);
check('registro volta a aguardar e nada é gravado', r2.status === 'pending' && !r2.signed_pdf_path && ![...fake.files.keys()].some(k => k.includes('sale-A-2/comprovante-assinado')));

// ---- confirmação interrompida (função caiu no meio): o link volta a funcionar depois de 2 minutos
fake.files.set(`warranty-receipts/${r2.original_pdf_path}`, pdfBytes);
r2.status = 'signing';
r2.updated_at = new Date().toISOString();
check('confirmação em andamento: segunda tentativa recusada', (await call({ action: 'sign', token: other.token, signature: rubrica })).ok === false);
r2.updated_at = new Date(Date.now() - 3 * 60 * 1000).toISOString();
const recovered = await call({ action: 'sign', token: other.token, signature: rubrica });
check('confirmação interrompida há mais de 2 min: cliente consegue confirmar', recovered.ok === true && r2.status === 'signed', JSON.stringify(recovered));

console.log(`\n${pass} OK, ${failN} falharam`);
if (failN) process.exit(1);
