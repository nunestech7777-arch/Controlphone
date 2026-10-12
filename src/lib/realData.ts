// ============================================================================
// CONTROLPHONE — CADASTROS OPERACIONAIS NO BANCO (MODO REAL)
// Clientes, fornecedores e estoque (aparelhos, acessórios, brindes e histórico
// de compras) já são lidos e gravados no Supabase. Os demais módulos entram
// aqui à medida que forem migrados.
//
// Fluxo de cada sincronização:
//   1. cadastros antigos (anteriores à ligação com o banco) ganham identificador novo;
//   2. o que está na fila de envio sobe para o servidor;
//   3. a lista do servidor passa a ser a lista da tela.
// ============================================================================

import { supabase } from './supabase';
import { store, SyncKind } from './store';
import { SYNC_TABLES } from './realSync';
import { UserRole } from '../types';

// O banco devolve null nos campos vazios; o sistema trabalha com campo ausente
function clean(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.keys(row).forEach(key => {
    if (row[key] !== null && key !== 'updated_at') out[key] = row[key];
  });
  return out as { id: string; tenant_id: string };
}

// O que cada perfil lê (fornecedores e histórico de compras expõem custos: só o administrador)
const readableKinds = (role: UserRole): SyncKind[] =>
  role === 'admin' || role === 'super_admin'
    ? ['customers', 'suppliers', 'devices', 'accessories', 'gifts', 'supplierPurchases']
    : ['customers', 'devices', 'accessories', 'gifts'];

let running: Promise<boolean> | null = null;
let lastSyncAt = 0;

/** Sincroniza os cadastros da loja. Devolve false quando algo não pôde ser enviado ou lido. */
export function syncTenantRecords(tenantId: string, role: UserRole): Promise<boolean> {
  if (!store.isRealMode || !tenantId) return Promise.resolve(true);
  if (running) return running;

  running = (async () => {
    try {
      store.syncRole = role;
      store.adoptLegacyRecords(tenantId, role);
      const pushed = await store.pushUnsynced();

      const kinds = readableKinds(role);
      const results = await Promise.all(
        kinds.map(kind => supabase.from(SYNC_TABLES[kind].table).select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }))
      );
      const failed = results.find(r => r.error);
      if (failed) {
        console.error('Falha ao carregar cadastros:', failed.error?.message);
        return false;
      }

      const remote: Partial<Record<SyncKind, { id: string; tenant_id: string }[]>> = {};
      kinds.forEach((kind, i) => {
        remote[kind] = (results[i].data || []).map(row => clean(row as Record<string, unknown>));
      });
      store.applyRemoteRecords(tenantId, remote);
      lastSyncAt = Date.now();
      return pushed;
    } catch (err) {
      console.error('Falha ao sincronizar cadastros:', err);
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Ao voltar para a aba do sistema, busca o que mudou nos outros aparelhos (no máximo a cada 20 s). */
export function syncOnFocus(tenantId: string, role: UserRole) {
  if (Date.now() - lastSyncAt < 20_000) return;
  void syncTenantRecords(tenantId, role);
}

/**
 * Tempo real: quando outro aparelho da loja altera estoque ou clientes, este busca a lista de novo.
 * Devolve a função que encerra a escuta.
 */
export function watchTenantRecords(tenantId: string, role: UserRole): () => void {
  if (!store.isRealMode || !tenantId) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void syncTenantRecords(tenantId, role);
    }, 1500);
  };
  const channel = supabase.channel(`estoque-${tenantId}`);
  (['devices', 'accessories', 'gifts', 'customers'] as const).forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` }, refresh);
  });
  channel.subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
