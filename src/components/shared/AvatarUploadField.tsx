// ============================================================================
// CONTROLPHONE — CAMPO "FOTO DE PERFIL" (ENVIAR, PRÉVIA, SUBSTITUIR, REMOVER)
// O upload acontece ao salvar o formulário; aqui só se valida e se mostra a prévia.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { AVATAR_ACCEPT, validateAvatarFile } from '../../lib/avatarStorage';

interface AvatarUploadFieldProps {
  name: string;
  currentUrl?: string | null;
  file: File | null;
  removed: boolean;
  onFileChange: (file: File | null) => void;
  onRemovedChange: (removed: boolean) => void;
}

export const AvatarUploadField: React.FC<AvatarUploadFieldProps> = ({
  name,
  currentUrl,
  file,
  removed,
  onFileChange,
  onRemovedChange
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shownUrl = previewUrl || (removed ? null : currentUrl) || null;
  const hasPhoto = Boolean(shownUrl);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;

    const invalid = validateAvatarFile(picked);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    onRemovedChange(false);
    onFileChange(picked);
  };

  const handleRemove = () => {
    setError('');
    onFileChange(null);
    onRemovedChange(true);
  };

  return (
    <div>
      <label className="font-bold text-slate-700 block mb-1">Foto de Perfil</label>
      <div className="flex items-center gap-4">
        <UserAvatar name={name || 'Novo funcionário'} src={shownUrl} size="xl" />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {hasPhoto ? 'Substituir foto' : 'Enviar foto'}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-1.5 rounded-xl border border-rose-200 bg-white text-rose-600 font-semibold text-[11px] hover:bg-rose-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400">JPG, JPEG, PNG ou WEBP, até 5 MB.</p>
          {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept={AVATAR_ACCEPT} onChange={handlePick} className="hidden" />
      </div>
    </div>
  );
};
