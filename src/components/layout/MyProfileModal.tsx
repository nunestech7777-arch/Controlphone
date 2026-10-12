// ============================================================================
// CONTROLPHONE — MEU PERFIL (FOTO DO ADMINISTRADOR / DONO DA LOJA)
// Aberto pelo nome do usuário na barra superior.
// ============================================================================

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { store } from '../../lib/store';
import { adminApi } from '../../lib/adminApi';
import { useAuth } from '../../context/AuthContext';
import { AvatarUploadField } from '../shared/AvatarUploadField';
import { removeAvatarFile, uploadAvatar } from '../../lib/avatarStorage';

export const MyProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser, currentTenant } = useAuth();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const roleLabel =
    currentUser.role === 'super_admin' ? 'Super Admin'
    : currentUser.role === 'admin' ? 'Administrador'
    : currentUser.role === 'seller' ? 'Vendedor' : 'Técnico';

  const hasChanges = Boolean(photoFile) || photoRemoved;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) { onClose(); return; }

    setSaving(true);
    setError('');
    try {
      const profile = store.profiles.find(p => p.id === currentUser.id);
      if (!profile) throw new Error('Perfil não encontrado.');
      const folder = currentTenant?.id || profile.tenant_id || 'plataforma';

      let avatarUrl: string | undefined;
      let avatarPath: string | undefined;
      if (photoFile) {
        const stored = await uploadAvatar(photoFile, folder, profile.id, profile.avatar_path);
        avatarUrl = stored.url;
        avatarPath = stored.path;
      } else {
        await removeAvatarFile(profile.avatar_path);
      }

      if (store.isRealMode) {
        const remote = await adminApi.updateUser(profile.id, { avatar_url: avatarUrl || null, avatar_path: avatarPath || null });
        if (!remote.ok) throw new Error(remote.error);
      }
      profile.avatar_url = avatarUrl;
      profile.avatar_path = avatarPath;

      store.addAuditLog({
        tenant_id: profile.tenant_id || undefined,
        user_id: profile.id,
        user_role: profile.role,
        action: photoFile ? 'FOTO_DE_PERFIL_ATUALIZADA' : 'FOTO_DE_PERFIL_REMOVIDA',
        module: 'Equipe da Loja',
        record_id: profile.id,
        details: { nome: profile.full_name }
      });
      store.saveToStorage();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in text-left">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-extrabold text-slate-800">Meu Perfil</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <AvatarUploadField
            name={currentUser.full_name}
            currentUrl={currentUser.avatar_url}
            file={photoFile}
            removed={photoRemoved}
            onFileChange={setPhotoFile}
            onRemovedChange={setPhotoRemoved}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Nome</span>
              <span className="font-semibold text-slate-800">{currentUser.full_name}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Perfil</span>
              <span className="font-semibold text-slate-800">{roleLabel}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 sm:col-span-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">E-mail de acesso</span>
              <span className="font-semibold text-slate-800 break-all">{currentUser.email}</span>
            </div>
          </div>

          {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-tenant-primary px-5 py-2 font-bold rounded-xl disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar Foto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
