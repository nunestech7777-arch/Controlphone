// ============================================================================
// CONTROLPHONE — AVATAR CIRCULAR (FOTO DO USUÁRIO OU INICIAIS)
// ============================================================================

import React, { useState } from 'react';
import { cn } from '../../lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl'
};

export const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, src, size = 'md', className }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return showImage ? (
    <img
      src={src as string}
      alt={`Foto de ${name}`}
      onError={() => setFailedSrc(src as string)}
      className={cn('rounded-full object-cover shrink-0 bg-slate-100', SIZE_CLASSES[size], className)}
    />
  ) : (
    <span
      aria-label={name}
      className={cn(
        'rounded-full shrink-0 inline-flex items-center justify-center font-bold bg-slate-100 text-slate-600 border border-slate-200',
        SIZE_CLASSES[size],
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
};
