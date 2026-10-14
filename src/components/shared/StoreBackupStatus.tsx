// ============================================================================
// CONTROLPHONE — SITUAÇÃO DO BACKUP (VISÃO DO ADMINISTRADOR DA LOJA)
// O administrador só enxerga a data do último backup e a situação. Criar,
// baixar, restaurar e excluir são exclusivos do Super Administrador.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { backupsAvailable, fetchMyLastBackup } from '../../lib/backupApi';
import { backupHealth } from '../../lib/backupFormat';

export const StoreBackupStatus: React.FC = () => {
  const { currentUser, isSupportMode } = useAuth();
  const visible = backupsAvailable() && currentUser.role === 'admin' && !isSupportMode;
  const [last, setLast] = useState<string | null | undefined>(undefined); // undefined = ainda não consultou

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void fetchMyLastBackup().then(result => {
      if (alive && result.ok) setLast(result.value);
    });
    return () => { alive = false; };
  }, [visible]);

  if (!visible || last === undefined) return null;
  const info = backupHealth(last);
  const when = last
    ? `${new Date(last).toLocaleDateString('pt-BR')} às ${new Date(last).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-semibold">Backup da loja:</span>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${info.badge}`}>{info.label}</span>
      <span>{when ? `último em ${when}` : info.text}</span>
    </p>
  );
};
