// ============================================================================
// CONTROLPHONE — EXCLUIR OU INATIVAR UM APARELHO DO ESTOQUE
// No modo real o banco confere as regras e executa tudo em uma transação
// (migration 22); depois a cópia local é ajustada e sincronizada. Na
// demonstração (sem banco) as mesmas regras rodam no navegador.
// ============================================================================

import { store } from './store';
import { checkDeviceRemoval, deactivateDeviceOnServer, deleteDeviceOnServer, DeviceRemovalCheck } from './realSync';
import { syncTenantRecords } from './realData';
import { UserRole } from '../types';

export type { DeviceRemovalCheck };

/** Impacto da exclusão e o que a impede, conferido no servidor. */
export async function loadRemovalCheck(deviceId: string): Promise<DeviceRemovalCheck | { error: string }> {
  if (!store.isRealMode) {
    const device = store.devices.find(d => d.id === deviceId);
    const purchases = store.devicePurchases(deviceId);
    const blockers = store.deviceRemovalBlockers(deviceId);
    return {
      canDelete: blockers.length === 0,
      blockers,
      canDeactivate: device?.status === 'available',
      purchasesCount: purchases.length,
      purchasesTotal: purchases.reduce((acc, p) => acc + Number(p.total_cost), 0)
    };
  }
  // alteração deste aparelho ainda na fila: envia antes, para o servidor decidir sobre o estado atual
  await store.pushUnsynced();
  return checkDeviceRemoval(deviceId);
}

export async function removeDevice(p: { deviceId: string; tenantId: string; userId: string; userRole: UserRole }):
  Promise<{ ok: true } | { ok: false; error: string; blockers?: string[] }> {
  if (!store.isRealMode) {
    const result = store.deleteDeviceLocally(p.deviceId, p.userId, p.userRole);
    return result.ok ? { ok: true } : { ok: false, error: result.error || 'Não foi possível excluir o aparelho.' };
  }
  const result = await deleteDeviceOnServer(p.deviceId);
  if (!result.ok) return result;
  store.forgetDeletedDevice(p.deviceId);
  void syncTenantRecords(p.tenantId, p.userRole); // traz o histórico gravado pelo servidor e confere o restante
  return { ok: true };
}

export async function deactivateDevice(p: { deviceId: string; tenantId: string; userId: string; userRole: UserRole; reason: string }):
  Promise<{ ok: true } | { ok: false; error: string }> {
  if (!p.reason.trim()) return { ok: false, error: 'Informe o motivo da inativação.' };
  if (!store.isRealMode) {
    const result = store.deactivateDeviceLocally({ ...p });
    return result.ok ? { ok: true } : { ok: false, error: result.error || 'Não foi possível inativar o aparelho.' };
  }
  const result = await deactivateDeviceOnServer(p.deviceId, p.reason.trim());
  if (!result.ok) return result;
  store.deactivateDeviceLocally({ ...p, confirmedByServer: true });
  void syncTenantRecords(p.tenantId, p.userRole);
  return { ok: true };
}
