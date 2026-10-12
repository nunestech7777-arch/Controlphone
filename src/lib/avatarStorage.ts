// ============================================================================
// CONTROLPHONE — FOTOS DE PERFIL (SUPABASE STORAGE, BUCKET "avatars")
// Caminho: {tenant_id}/{user_id}/{uuid}.{ext}  — a referência vai para profiles.avatar_url/avatar_path.
// Sem sessão do Supabase (modo demonstração) a foto é reduzida e guardada só no estado local.
// ============================================================================

import { supabase, isSupabaseConfigured } from './supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const AVATAR_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export interface StoredAvatar {
  url: string;
  path?: string; // definido somente quando o arquivo foi para o Supabase Storage
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';

// Valida tipo e tamanho ANTES de qualquer upload
export const validateAvatarFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'Formato não suportado. Envie uma imagem JPG, JPEG, PNG ou WEBP.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'A imagem excede o limite de 5 MB.';
  }
  return null;
};

export const hasSupabaseSession = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
};

// Modo demonstração: recorta em quadrado, reduz para 256px e comprime (nunca guarda o original)
const toLocalThumbnail = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler a imagem selecionada.'));
    };
    img.src = objectUrl;
  });

export const removeAvatarFile = async (path?: string): Promise<void> => {
  if (!path || !(await hasSupabaseSession())) return;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw new Error('Não foi possível remover a foto anterior: ' + error.message);
};

// Envia a nova foto e, somente após o sucesso, remove a anterior (sem arquivos órfãos)
export const uploadAvatar = async (
  file: File,
  tenantId: string,
  userId: string,
  previousPath?: string
): Promise<StoredAvatar> => {
  const invalid = validateAvatarFile(file);
  if (invalid) throw new Error(invalid);

  if (!(await hasSupabaseSession())) {
    return { url: await toLocalThumbnail(file) };
  }

  const ext = extensionOf(file.name) === 'jpeg' ? 'jpg' : extensionOf(file.name);
  const path = `${tenantId}/${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) throw new Error('Falha no envio da foto: ' + error.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  if (previousPath && previousPath !== path) {
    await removeAvatarFile(previousPath).catch(() => undefined);
  }
  return { url: data.publicUrl, path };
};
