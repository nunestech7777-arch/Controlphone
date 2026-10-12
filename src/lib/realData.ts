// ============================================================================
// CONTROLPHONE — CADASTROS OPERACIONAIS NO BANCO (MODO REAL)
// Clientes e fornecedores já são lidos e gravados no Supabase. Os demais
// módulos entram aqui à medida que forem migrados.
//
// Fluxo de cada sincronização:
//   1. cadastros antigos (anteriores à ligação com o banco) ganham identificador novo;
//   2. o que está na fila de envio sobe para o servidor;
//   3. a lista do servidor passa a ser a lista da tela.
// ============================================================================

import { supabase } from './supabase';
import { store } from './store';
import { Customer, Supplier, UserRole } from '../types';

// O banco devolve null nos campos vazios; o sistema trabalha com campo ausente
function clean<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  Object.keys(row).forEach(key => {
    if (row[key] !== null && key !== 'updated_at') out[key] = row[key];
  });
  return out as T;
}

let running: Promise<boolean> | null = null;
let lastSyncAt = 0;

/** Sincroniza clientes e fornecedores da loja. Devolve false quando o servidor não respondeu. */
export function syncTenantRecords(tenantId: string, role: UserRole): Promise<boolean> {
  if (!store.isRealMode || !tenantId) return Promise.resolve(true);
  if (running) return running;

  const canManageSuppliers = role === 'admin' || role === 'super_admin';
  const canWriteCustomers = role !== 'technician';

  running = (async () => {
    try {
      store.adoptLegacyRecords(tenantId, { customers: canWriteCustomers, suppliers: canManageSuppliers });
      const pushed = await store.pushUnsynced();

      const [customersRes, suppliersRes] = await Promise.all([
        supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        canManageSuppliers
          ? supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
          : Promise.resolve({ data: null, error: null })
      ]);
      if (customersRes.error || suppliersRes.error) {
        console.error('Falha ao carregar cadastros:', customersRes.error?.message || suppliersRes.error?.message);
        return false;
      }

      store.applyRemoteRecords(tenantId, {
        customers: (customersRes.data || []).map(row => clean<Customer>(row)),
        suppliers: suppliersRes.data ? suppliersRes.data.map(row => clean<Supplier>(row)) : undefined
      });
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

/** Ao voltar para a aba do sistema, busca o que foi cadastrado nos outros aparelhos (no máximo a cada 20 s). */
export function syncOnFocus(tenantId: string, role: UserRole) {
  if (Date.now() - lastSyncAt < 20_000) return;
  void syncTenantRecords(tenantId, role);
}
