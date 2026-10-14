// ============================================================================
// CONTROLPHONE — BACKUPS DA LOJA (EXCLUSIVO SUPER ADMIN)
// Aba da gestão da loja: último backup, histórico, criar, baixar, restaurar
// (de um backup guardado ou de um arquivo) e excluir. Cada backup é de UMA loja.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, DatabaseBackup, Download, History, Loader2, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload
} from 'lucide-react';
import { Tenant } from '../../../types';
import {
  BACKUP_EXTENSION, BACKUP_MAX_FILE_BYTES, BACKUP_TYPE_LABEL, BackupCounts, BackupFileError, BackupPayload,
  BackupType, COUNT_LABELS, backupHealth, belongsToTenant, formatBytes, readBackupFile
} from '../../../lib/backupFormat';
import {
  TenantBackup, backupsAvailable, createBackup, deleteBackup, downloadBackup, listBackups, restoreBackup
} from '../../../lib/backupApi';
import { refreshRealData } from '../../../lib/realSession';

const primaryBtn = 'px-4 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 disabled:pointer-events-none';
const ghostBtn = 'px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100 text-xs inline-flex items-center gap-2 transition-colors disabled:opacity-60 disabled:pointer-events-none';
const dangerBtn = 'px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none';
const iconBtn = 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none';

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const CONFIRM_WORD = 'RESTAURAR';

/** Backup escolhido para restaurar: um guardado no servidor ou o conteúdo de um arquivo */
interface RestoreDraft {
  source: { backupId: string } | { payload: BackupPayload };
  origin: string;
  createdAt: string;
  type?: BackupType;
  counts: Partial<BackupCounts>;
}

const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-xs font-semibold text-slate-800 break-words">{children}</dd>
  </div>
);

const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({
  title, onClose, children, footer
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm" onMouseDown={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] flex flex-col"
    >
      <h3 className="px-5 py-4 border-b border-slate-100 text-sm font-extrabold text-slate-800 shrink-0">{title}</h3>
      <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-600">{children}</div>
      <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">{footer}</div>
    </div>
  </div>
);

export const TenantBackupsTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const tenantId = tenant.id;
  const available = backupsAvailable();

  const [backups, setBackups] = useState<TenantBackup[]>([]);
  const [loading, setLoading] = useState(available);
  const [busy, setBusy] = useState<string | null>(null); // o que está em andamento (trava os botões)
  const [notice, setNotice] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const [restore, setRestore] = useState<RestoreDraft | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [removing, setRemoving] = useState<TenantBackup | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const result = await listBackups(tenantId);
    if (!alive.current) return;
    if (result.ok) setBackups(result.value);
    else setNotice({ ok: false, text: result.error });
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    alive.current = true;
    if (available) void load();
    return () => { alive.current = false; };
  }, [available, load]);

  if (!available) {
    return (
      <div className="py-12 text-center text-slate-400">
        <DatabaseBackup className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p className="text-xs font-semibold max-w-sm mx-auto">
          Os backups são gerados e guardados no servidor. Na demonstração (sem banco de dados conectado) este recurso fica desligado.
        </p>
      </div>
    );
  }

  const completed = backups.filter(b => b.status === 'completed');
  const last = completed[0];
  const health = backupHealth(last?.created_at);

  const handleCreate = async () => {
    setBusy('create');
    setNotice(null);
    const result = await createBackup(tenantId);
    if (result.ok) {
      await load();
      setNotice({ ok: true, text: 'Backup criado. Use "Baixar" para guardar uma cópia fora do sistema.' });
    } else {
      setNotice({ ok: false, text: result.error });
    }
    setBusy(null);
  };

  const handleDownload = async (backup: TenantBackup) => {
    setBusy(`download:${backup.id}`);
    setNotice(null);
    const result = await downloadBackup(backup);
    setNotice(result.ok ? { ok: true, text: `Arquivo ${result.value} baixado.` } : { ok: false, text: result.error });
    setBusy(null);
  };

  const handleDelete = async () => {
    if (!removing) return;
    setBusy('delete');
    const result = await deleteBackup(removing.id);
    setRemoving(null);
    if (result.ok) {
      await load();
      setNotice({ ok: true, text: 'Backup excluído.' });
    } else {
      setNotice({ ok: false, text: result.error });
    }
    setBusy(null);
  };

  const openRestore = (draft: RestoreDraft) => {
    setConfirmText('');
    setNotice(null);
    setRestore(draft);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setNotice(null);
    if (file.size > BACKUP_MAX_FILE_BYTES) {
      return setNotice({ ok: false, text: 'O arquivo é grande demais para ser um backup do Controlphone.' });
    }
    setBusy('file');
    try {
      const parsed = await readBackupFile(new Uint8Array(await file.arrayBuffer()));
      if (!belongsToTenant(parsed.payload, tenantId)) {
        setNotice({
          ok: false,
          text: `Este backup pertence a outra loja (${parsed.manifest.tenant_name || 'loja desconhecida'}). A restauração foi bloqueada.`
        });
      } else {
        openRestore({
          source: { payload: parsed.payload },
          origin: `Arquivo ${file.name}`,
          createdAt: parsed.payload.created_at,
          type: parsed.payload.type,
          counts: parsed.manifest.counts
        });
      }
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof BackupFileError ? err.message : 'Não foi possível ler o arquivo. Ele pode estar corrompido.'
      });
    }
    setBusy(null);
  };

  const handleRestore = async () => {
    if (!restore || confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setBusy('restore');
    const result = await restoreBackup(tenantId, restore.source);
    setRestore(null);
    if (result.ok) {
      await Promise.all([load(), refreshRealData()]);
      setNotice({
        ok: true,
        text: 'Restauração concluída. O estado anterior ficou guardado como backup de "Segurança", caso precise desfazer.',
        details: [
          ...result.value.notes,
          'Peça para todos os usuários desta loja saírem do sistema e entrarem de novo, para carregarem os dados restaurados.'
        ]
      });
    } else {
      setNotice({ ok: false, text: result.error });
    }
    setBusy(null);
  };

  return (
    <div className="space-y-5">
      {/* ÚLTIMO BACKUP */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            Último Backup
          </h3>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${health.badge}`}>{health.label}</span>
        </div>
        {last ? (
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Stat label="Data">{dateOf(last.created_at)}</Stat>
            <Stat label="Hora">{timeOf(last.created_at)}</Stat>
            <Stat label="Tipo">{BACKUP_TYPE_LABEL[last.type]}</Stat>
            <Stat label="Tamanho">{formatBytes(last.size_bytes)}</Stat>
            <Stat label="Status">{health.text}</Stat>
          </dl>
        ) : (
          <p className="text-xs text-slate-500">{loading ? 'Carregando…' : 'Nenhum backup encontrado para esta loja.'}</p>
        )}
      </div>

      {/* AÇÕES */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryBtn} disabled={Boolean(busy)} onClick={handleCreate}>
          {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
          Criar Backup
        </button>
        <button type="button" className={ghostBtn} disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
          {busy === 'file' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Restaurar de um arquivo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={`${BACKUP_EXTENSION},.zip,application/zip`}
          onChange={handleFile}
          className="hidden"
          aria-label="Arquivo de backup"
        />
        <button type="button" className={`${ghostBtn} ml-auto`} disabled={Boolean(busy)} onClick={() => { setLoading(true); void load(); }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {notice && (
        <div
          role={notice.ok ? 'status' : 'alert'}
          className={`px-4 py-3 rounded-xl text-xs font-semibold border ${
            notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {notice.text}
          {notice.details && notice.details.length > 0 && (
            <ul className="mt-1.5 list-disc pl-4 font-medium space-y-0.5">
              {notice.details.map(d => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* HISTÓRICO */}
      <div>
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-2">
          <History className="w-4 h-4 text-slate-500" />
          Histórico de Backups
        </h3>
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {backups.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">{loading ? 'Carregando…' : 'Nenhum backup ainda.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr className="text-left">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Tamanho</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Criado por</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => {
                    const ok = b.status === 'completed';
                    return (
                      <tr key={b.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">{dateOf(b.created_at)}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{timeOf(b.created_at)}</td>
                        <td className="py-3 px-4 text-slate-600">{BACKUP_TYPE_LABEL[b.type] || b.type}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{ok ? formatBytes(b.size_bytes) : '—'}</td>
                        <td className="py-3 px-4">
                          <span
                            title={b.error || undefined}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                          >
                            {ok ? 'Concluído' : 'Falhou'}
                          </span>
                          {!ok && b.error && <span className="block mt-1 text-[10px] text-rose-600 max-w-[220px]">{b.error}</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{b.created_by_name || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-1">
                            <button type="button" className={iconBtn} disabled={!ok || Boolean(busy)} title="Baixar Backup"
                              aria-label={`Baixar backup de ${dateOf(b.created_at)} ${timeOf(b.created_at)}`} onClick={() => handleDownload(b)}>
                              {busy === `download:${b.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </button>
                            <button type="button" className={iconBtn} disabled={!ok || Boolean(busy)} title="Restaurar Backup"
                              aria-label={`Restaurar backup de ${dateOf(b.created_at)} ${timeOf(b.created_at)}`}
                              onClick={() => openRestore({
                                source: { backupId: b.id }, origin: 'Backup guardado no servidor',
                                createdAt: b.created_at, type: b.type, counts: b.counts
                              })}>
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button type="button" className={`${iconBtn} text-rose-500 hover:bg-rose-50`} disabled={Boolean(busy)} title="Excluir Backup"
                              aria-label={`Excluir backup de ${dateOf(b.created_at)} ${timeOf(b.created_at)}`} onClick={() => setRemoving(b)}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Automático a cada 4 dias; ficam os 30 automáticos mais recentes. Backups manuais só saem quando você exclui.
          Os arquivos PDF dos modelos de documento e as fotos dos usuários não entram no backup (só o cadastro deles).
        </p>
      </div>

      {/* CONFIRMAÇÃO DA RESTAURAÇÃO */}
      {restore && (
        <Dialog
          title={`Restaurar backup — ${tenant.trade_name}`}
          onClose={() => { if (busy !== 'restore') setRestore(null); }}
          footer={<>
            <button type="button" className={ghostBtn} disabled={busy === 'restore'} onClick={() => setRestore(null)}>Cancelar</button>
            <button type="button" className={dangerBtn}
              disabled={busy === 'restore' || confirmText.trim().toUpperCase() !== CONFIRM_WORD} onClick={handleRestore}>
              {busy === 'restore' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Substituir os dados atuais
            </button>
          </>}
        >
          <dl className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <Stat label="Data do Backup">{dateOf(restore.createdAt)} às {timeOf(restore.createdAt)}</Stat>
            <Stat label="Origem">{restore.origin}{restore.type ? ` · ${BACKUP_TYPE_LABEL[restore.type]}` : ''}</Stat>
            {COUNT_LABELS.map(({ key, label }) => (
              <Stat key={key} label={label}>{(restore.counts[key] ?? 0).toLocaleString('pt-BR')}</Stat>
            ))}
          </dl>

          <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Deseja substituir os dados atuais pelos dados deste backup?</p>
              <p>
                Tudo o que foi lançado nesta loja depois de {dateOf(restore.createdAt)} às {timeOf(restore.createdAt)} deixa
                de existir. As outras lojas não são afetadas.
              </p>
            </div>
          </div>

          <ul className="list-disc pl-4 space-y-1">
            <li>Antes de substituir, o sistema guarda um backup de segurança do estado atual. Dá para desfazer.</li>
            <li>O histórico de atividades não é apagado, e a restauração fica registrada nele.</li>
            <li>Situação e plano da loja, logins e senhas não mudam. Usuários não são criados nem excluídos.</li>
          </ul>

          <label className="block">
            <span className="font-bold text-slate-700 block mb-1">Para confirmar, digite {CONFIRM_WORD}</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400"
            />
          </label>
        </Dialog>
      )}

      {/* CONFIRMAÇÃO DA EXCLUSÃO */}
      {removing && (
        <Dialog
          title="Excluir backup"
          onClose={() => { if (busy !== 'delete') setRemoving(null); }}
          footer={<>
            <button type="button" className={ghostBtn} disabled={busy === 'delete'} onClick={() => setRemoving(null)}>Cancelar</button>
            <button type="button" className={dangerBtn} disabled={busy === 'delete'} onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              Excluir Backup
            </button>
          </>}
        >
          <p>
            Excluir o backup <strong>{BACKUP_TYPE_LABEL[removing.type]?.toLowerCase()}</strong> de{' '}
            <strong>{dateOf(removing.created_at)} às {timeOf(removing.created_at)}</strong>? Ele não poderá mais ser
            baixado nem restaurado. Os dados atuais da loja não mudam.
          </p>
        </Dialog>
      )}
    </div>
  );
};
