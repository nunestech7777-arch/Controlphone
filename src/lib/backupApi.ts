// ============================================================================
// CONTROLPHONE — BACKUPS DA LOJA: CHAMADAS AO SERVIDOR
// Tudo passa pelas funções da migration 20, que conferem no servidor que quem
// chama é o Super Administrador e que o backup é da loja informada.
// ============================================================================

import { supabase } from './supabase';
import { store } from './store';
import {
  BackupCounts, BackupPayload, BackupType, assertValidPayload, buildBackupFile
} from './backupFormat';

export interface TenantBackup {
  id: string;
  tenant_id: string;
  type: BackupType;
  status: 'completed' | 'failed';
  size_bytes: number;
  counts: Partial<BackupCounts>;
  error: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface BackupOverviewRow {
  tenant_id: string;
  last_backup_at: string;
  last_type: BackupType;
  last_size_bytes: number;
  backups_count: number;
}

export interface RestoreResult {
  safety_backup_id: string;
  counts: BackupCounts;
  notes: string[];
}

export type BackupResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Backups ficam no servidor: na demonstração (sem banco) o recurso não existe. */
export const backupsAvailable = () => store.isRealMode;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** As funções do banco já respondem em português; o resto vira uma frase que dá para entender. */
function explain(error: { message?: string; code?: string } | null, action: string): string {
  const text = error?.message || '';
  const lower = text.toLowerCase();
  if (lower.includes('could not find the function') || lower.includes('does not exist') || error?.code === 'PGRST202') {
    return 'O servidor ainda não tem o módulo de backup (falta rodar a migration 20).';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';
  }
  if (lower.includes('statement timeout') || lower.includes('canceling statement')) {
    return `A loja tem dados demais para ${action} de uma vez e o servidor interrompeu a operação. Nada foi alterado.`;
  }
  if (lower.includes('duplicate key') || lower.includes('violates')) {
    return 'O backup contém registros que entram em conflito com dados existentes. A restauração foi desfeita e nada foi alterado.';
  }
  if (lower.includes('permission denied')) return 'Apenas o Super Administrador gerencia backups.';
  return text || `Não foi possível ${action}.`;
}

const num = (v: unknown) => Number(v) || 0;

export async function listBackups(tenantId: string): Promise<BackupResult<TenantBackup[]>> {
  const { data, error } = await supabase
    .from('tenant_backups')
    .select('id, tenant_id, type, status, size_bytes, counts, error, created_by_name, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return fail(explain(error, 'carregar os backups'));
  return {
    ok: true,
    value: (data || []).map(row => ({ ...(row as TenantBackup), size_bytes: num(row.size_bytes), counts: row.counts || {} }))
  };
}

export async function createBackup(tenantId: string): Promise<BackupResult<string>> {
  const { data, error } = await supabase.rpc('create_tenant_backup', { p_tenant_id: tenantId });
  if (error) return fail(explain(error, 'criar o backup'));
  return { ok: true, value: String(data) };
}

/** Busca o conteúdo no servidor, monta o arquivo .controlphone e entrega ao navegador. */
export async function downloadBackup(backup: Pick<TenantBackup, 'id' | 'tenant_id'>): Promise<BackupResult<string>> {
  const { data, error } = await supabase.rpc('get_tenant_backup', { p_backup_id: backup.id });
  if (error) return fail(explain(error, 'baixar o backup'));
  try {
    assertValidPayload(data);
    const payload = data as BackupPayload;
    // defesa em profundidade: o servidor já filtra, mas um backup de outra loja nunca vira arquivo desta
    if (payload.tenant_id !== backup.tenant_id) return fail('O servidor devolveu um backup de outra loja. O arquivo não foi gerado.');
    const file = await buildBackupFile(payload);
    const url = URL.createObjectURL(new Blob([file.bytes as unknown as BlobPart], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true, value: file.name };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Não foi possível montar o arquivo de backup.');
  }
}

export async function deleteBackup(backupId: string): Promise<BackupResult<null>> {
  const { error } = await supabase.rpc('delete_tenant_backup', { p_backup_id: backupId });
  if (error) return fail(explain(error, 'excluir o backup'));
  return { ok: true, value: null };
}

/** Restaura a partir de um backup guardado no servidor OU do conteúdo de um arquivo. */
export async function restoreBackup(
  tenantId: string,
  source: { backupId: string } | { payload: BackupPayload }
): Promise<BackupResult<RestoreResult>> {
  const { data, error } = await supabase.rpc('restore_tenant_backup', {
    p_tenant_id: tenantId,
    p_backup_id: 'backupId' in source ? source.backupId : null,
    p_payload: 'payload' in source ? source.payload : null
  });
  if (error) return fail(explain(error, 'restaurar o backup'));
  const result = (data || {}) as Partial<RestoreResult>;
  return {
    ok: true,
    value: {
      safety_backup_id: String(result.safety_backup_id || ''),
      counts: result.counts as BackupCounts,
      notes: Array.isArray(result.notes) ? result.notes : []
    }
  };
}

/** Último backup de cada loja (coluna "Status do Backup"). */
export async function fetchBackupOverview(): Promise<BackupResult<Record<string, BackupOverviewRow>>> {
  const { data, error } = await supabase.rpc('tenant_backup_overview');
  if (error) return fail(explain(error, 'carregar a situação dos backups'));
  const map: Record<string, BackupOverviewRow> = {};
  ((data || []) as BackupOverviewRow[]).forEach(row => {
    map[row.tenant_id] = { ...row, last_size_bytes: num(row.last_size_bytes), backups_count: num(row.backups_count) };
  });
  return { ok: true, value: map };
}

/**
 * Reforço do agendamento do servidor: faz os backups automáticos que estiverem atrasados.
 * Devolve quantos foram feitos (0 quando está tudo em dia ou quando não deu para conferir).
 */
export async function runDueBackups(): Promise<number> {
  const { data, error } = await supabase.rpc('run_due_tenant_backups');
  return error ? 0 : num(data);
}

/** Para o administrador da loja: só a data do último backup da própria loja. */
export async function fetchMyLastBackup(): Promise<BackupResult<string | null>> {
  const { data, error } = await supabase.rpc('my_tenant_last_backup');
  if (error) return fail(explain(error, 'consultar o backup'));
  return { ok: true, value: (data as string | null) || null };
}
