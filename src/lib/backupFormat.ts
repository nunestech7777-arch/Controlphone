// ============================================================================
// CONTROLPHONE — ARQUIVO DE BACKUP DA LOJA (.controlphone)
//
// O arquivo é um ZIP com dois itens:
//   manifesto.json  de qual loja é, quando foi gerado, resumo e conferência
//   dados.json      o conteúdo do backup, exatamente como o servidor gerou
//
// Aqui ficam só funções puras (montar, ler, validar, resumir). Quem fala com
// o servidor é lib/backupApi.ts. A validação é repetida no servidor: a
// restauração nunca confia só no que o navegador conferiu.
// ============================================================================

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const BACKUP_FORMAT = 'controlphone-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.controlphone';
/** Arquivo maior que isso não é lido (protege o navegador de um arquivo errado) */
export const BACKUP_MAX_FILE_BYTES = 300 * 1024 * 1024;

export type BackupType = 'manual' | 'automatic' | 'pre_restore';

export interface BackupCounts {
  customers: number;
  products: number;
  sales: number;
  service_orders: number;
  warranties: number;
  users: number;
  financial: number;
}

export interface BackupPayload {
  format: string;
  version: number;
  backup_id?: string;
  tenant_id: string;
  tenant_name?: string;
  type?: BackupType;
  created_at: string;
  counts?: BackupCounts;
  tables: Record<string, unknown[]>;
}

export interface BackupManifest {
  format: string;
  version: number;
  backup_id?: string;
  tenant_id: string;
  tenant_name: string;
  type: BackupType;
  created_at: string;
  counts: BackupCounts;
  sha256: string;
}

export const BACKUP_TYPE_LABEL: Record<BackupType, string> = {
  manual: 'Manual',
  automatic: 'Automático',
  pre_restore: 'Segurança (antes de restaurar)'
};

export const COUNT_LABELS: { key: keyof BackupCounts; label: string }[] = [
  { key: 'customers', label: 'Clientes' },
  { key: 'products', label: 'Produtos' },
  { key: 'sales', label: 'Vendas' },
  { key: 'service_orders', label: 'Ordens de Serviço' },
  { key: 'warranties', label: 'Garantias' },
  { key: 'users', label: 'Usuários' },
  { key: 'financial', label: 'Financeiro (lançamentos)' }
];

export class BackupFileError extends Error {}

const rowsOf = (payload: BackupPayload, table: string): unknown[] => {
  const rows = payload.tables?.[table];
  return Array.isArray(rows) ? rows : [];
};

/** Mesmo resumo que o servidor calcula (função backup_counts da migration 20). */
export function countBackup(payload: BackupPayload): BackupCounts {
  const kinds: Record<string, number> = {};
  rowsOf(payload, 'tenant_records').forEach(row => {
    const kind = String((row as { kind?: unknown })?.kind ?? '');
    kinds[kind] = (kinds[kind] || 0) + 1;
  });
  const len = (table: string) => rowsOf(payload, table).length;
  return {
    customers: len('customers'),
    products: len('devices') + len('accessories') + len('gifts'),
    sales: (kinds.sales || 0) + len('sales'),
    service_orders: (kinds.serviceOrders || 0) + len('service_orders'),
    warranties: (kinds.warranties || 0) + len('warranties'),
    users: len('profiles'),
    financial: (kinds.expenses || 0) + len('expenses')
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** NomeDaLoja_2026-10-13_17-45.controlphone (hora local de quando o backup foi gerado) */
export function backupFileName(tenantName: string, createdAt: string): string {
  const name = (tenantName || 'Loja')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('') || 'Loja';
  const d = new Date(createdAt);
  const when = Number.isNaN(d.getTime())
    ? 'data-desconhecida'
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${name}_${when}${BACKUP_EXTENSION}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** Confere a estrutura do conteúdo. Lança BackupFileError com a explicação. */
export function assertValidPayload(payload: unknown): asserts payload is BackupPayload {
  const p = payload as Partial<BackupPayload> | null;
  if (!p || typeof p !== 'object' || p.format !== BACKUP_FORMAT) {
    throw new BackupFileError('Este arquivo não é um backup do Controlphone.');
  }
  if (typeof p.version !== 'number' || p.version > BACKUP_VERSION) {
    throw new BackupFileError('Este backup foi gerado por uma versão mais nova do sistema e não pode ser restaurado aqui.');
  }
  if (!isUuid(p.tenant_id) || !p.tables || typeof p.tables !== 'object' || Array.isArray(p.tables)) {
    throw new BackupFileError('O arquivo de backup está incompleto ou corrompido.');
  }
  if (Object.values(p.tables).some(rows => !Array.isArray(rows))) {
    throw new BackupFileError('O arquivo de backup está incompleto ou corrompido.');
  }
}

/** Monta o arquivo .controlphone a partir do conteúdo devolvido pelo servidor. */
export async function buildBackupFile(payload: BackupPayload): Promise<{ name: string; bytes: Uint8Array; manifest: BackupManifest }> {
  assertValidPayload(payload);
  const data = strToU8(JSON.stringify(payload));
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: payload.version,
    backup_id: payload.backup_id,
    tenant_id: payload.tenant_id,
    tenant_name: payload.tenant_name || 'Loja',
    type: payload.type || 'manual',
    created_at: payload.created_at,
    counts: payload.counts || countBackup(payload),
    sha256: await sha256Hex(data)
  };
  const bytes = zipSync(
    { 'manifesto.json': strToU8(JSON.stringify(manifest, null, 2)), 'dados.json': data },
    { level: 6 }
  );
  return { name: backupFileName(manifest.tenant_name, manifest.created_at), bytes, manifest };
}

export interface ParsedBackup {
  manifest: BackupManifest;
  payload: BackupPayload;
}

/** Lê e confere um arquivo .controlphone (ZIP íntegro, formato, versão e conteúdo sem alteração). */
export async function readBackupFile(bytes: Uint8Array): Promise<ParsedBackup> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupFileError('Este arquivo não é um backup do Controlphone.');
  }
  const rawManifest = files['manifesto.json'];
  const rawData = files['dados.json'];
  if (!rawManifest || !rawData) throw new BackupFileError('Este arquivo não é um backup do Controlphone.');

  let manifest: BackupManifest;
  let payload: unknown;
  try {
    manifest = JSON.parse(strFromU8(rawManifest));
    payload = JSON.parse(strFromU8(rawData));
  } catch {
    throw new BackupFileError('O arquivo de backup está incompleto ou corrompido.');
  }
  assertValidPayload(payload);
  if (!manifest || manifest.format !== BACKUP_FORMAT || manifest.tenant_id !== payload.tenant_id) {
    throw new BackupFileError('O arquivo de backup está incompleto ou corrompido.');
  }
  if (manifest.sha256 !== (await sha256Hex(rawData))) {
    throw new BackupFileError('O conteúdo do backup foi alterado ou está corrompido (a conferência não bate).');
  }
  // o resumo mostrado antes de restaurar vem do conteúdo, não do que o manifesto afirma
  return { payload, manifest: { ...manifest, counts: countBackup(payload) } };
}

/** O backup é desta loja? (o servidor confere de novo) */
export const belongsToTenant = (payload: Pick<BackupPayload, 'tenant_id'>, tenantId: string) =>
  payload.tenant_id.toLowerCase() === tenantId.toLowerCase();

// ---- Indicador "Status do Backup" ----

export type BackupHealth = 'updated' | 'attention' | 'none';

/** O automático roda a cada 4 dias: até 5 dias está em dia; acima disso algo falhou. */
export const BACKUP_FRESH_DAYS = 5;

export interface BackupHealthInfo {
  health: BackupHealth;
  label: string;
  text: string;
  badge: string;
}

export function backupHealth(lastBackupAt: string | null | undefined, now: Date = new Date()): BackupHealthInfo {
  const last = lastBackupAt ? new Date(lastBackupAt).getTime() : NaN;
  if (Number.isNaN(last)) {
    return { health: 'none', label: 'Sem Backup', text: 'Nenhum backup encontrado', badge: 'bg-rose-100 text-rose-700' };
  }
  const hours = Math.max(0, (now.getTime() - last) / 3_600_000);
  const days = Math.floor(hours / 24);
  const ago = hours < 1 ? 'há menos de 1 hora'
    : hours < 24 ? `há ${Math.floor(hours)} hora${Math.floor(hours) === 1 ? '' : 's'}`
    : `há ${days} dia${days === 1 ? '' : 's'}`;
  return days <= BACKUP_FRESH_DAYS
    ? { health: 'updated', label: 'Atualizado', text: `Backup realizado ${ago}`, badge: 'bg-emerald-100 text-emerald-700' }
    : { health: 'attention', label: 'Atenção', text: `Último backup ${ago}`, badge: 'bg-amber-100 text-amber-800' };
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
