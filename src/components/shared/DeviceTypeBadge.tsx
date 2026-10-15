// ============================================================================
// CONTROLPHONE — SELO DO TIPO DO APARELHO (SEMINOVO / LACRADO)
// ============================================================================

import React from 'react';
import { DeviceType } from '../../types';

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  seminovo: 'Seminovo',
  lacrado: 'Lacrado'
};

const STYLES: Record<DeviceType | 'none', string> = {
  seminovo: 'bg-slate-100 text-slate-700 border-slate-200',
  lacrado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  none: 'bg-amber-50 text-amber-700 border-amber-200'
};

/** Selo discreto do tipo. Aparelho antigo, ainda não classificado pelo administrador, aparece como "Sem tipo". */
export const DeviceTypeBadge: React.FC<{ type?: DeviceType }> = ({ type }) => (
  <span
    title={type ? undefined : 'Aparelho cadastrado antes da classificação. Edite para informar se é seminovo ou lacrado.'}
    className={`inline-block whitespace-nowrap px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${STYLES[type || 'none']}`}
  >
    {type ? DEVICE_TYPE_LABELS[type] : 'Sem tipo'}
  </span>
);
