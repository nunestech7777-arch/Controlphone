// ============================================================================
// CONTROLPHONE — IDENTIDADE VISUAL DA LOJA (EXCLUSIVO SUPER ADMIN)
// Logos, favicon e cores com pré-visualização em tempo real. Usado na criação
// da loja e na alteração posterior.
// ============================================================================

import React from 'react';
import { Eye, Smartphone } from 'lucide-react';
import { TenantTheme } from '../../../types';
import { isDarkColor, resolveThemeColors } from '../../../lib/tenantSetup';
import { ColorField, ImageUploadField } from './fields';

export type BrandDraft = Pick<TenantTheme,
  'logo_url' | 'logo_compact_url' | 'favicon_url' | 'primary_color' | 'secondary_color'
  | 'accent_color' | 'button_color' | 'sidebar_color' | 'card_color' | 'action_button_color'>;

export const brandDraftOf = (theme: TenantTheme): BrandDraft => ({
  logo_url: theme.logo_url,
  logo_compact_url: theme.logo_compact_url,
  favicon_url: theme.favicon_url,
  primary_color: theme.primary_color,
  secondary_color: theme.secondary_color,
  accent_color: theme.accent_color,
  button_color: theme.button_color,
  sidebar_color: theme.sidebar_color,
  card_color: theme.card_color,
  action_button_color: theme.action_button_color
});

const PRESETS = [
  { name: 'Royal Blue', primary: '#1845E8', secondary: '#0B0F17', action: '#3B82F6' },
  { name: 'Electric Indigo', primary: '#4F46E5', secondary: '#0B0F17', action: '#818CF8' },
  { name: 'Ocean Cyan', primary: '#0891B2', secondary: '#0B0F17', action: '#06B6D4' },
  { name: 'Emerald Prime', primary: '#059669', secondary: '#0B0F17', action: '#34D399' },
  { name: 'Midnight Violet', primary: '#7C3AED', secondary: '#0B0F17', action: '#A78BFA' },
  { name: 'Golden Luxury', primary: '#D97706', secondary: '#18181B', action: '#F59E0B' }
];

interface BrandIdentityFormProps {
  value: BrandDraft;
  onChange: (patch: Partial<BrandDraft>) => void;
  displayName: string;
}

export const BrandIdentityForm: React.FC<BrandIdentityFormProps> = ({ value, onChange, displayName }) => {
  const colors = resolveThemeColors(value);
  const name = displayName.trim() || 'Sua Loja';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="xl:col-span-3 space-y-6">
        {/* LOGOS */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Logotipos</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ImageUploadField
              label="Logo principal"
              hint="Barra lateral e documentos. Ideal: horizontal, fundo transparente."
              value={value.logo_url}
              onChange={(logo_url) => onChange({ logo_url })}
              maxSide={480}
            />
            <ImageUploadField
              label="Logo reduzida"
              hint="Símbolo para espaços pequenos. Ideal: quadrada."
              value={value.logo_compact_url}
              onChange={(logo_compact_url) => onChange({ logo_compact_url })}
              maxSide={192}
              square
            />
            <ImageUploadField
              label="Favicon"
              optional
              hint="Ícone da aba do navegador."
              value={value.favicon_url}
              onChange={(favicon_url) => onChange({ favicon_url })}
              maxSide={64}
              square
            />
          </div>
        </section>

        {/* CORES */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Cores</h4>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChange({
                  primary_color: preset.primary,
                  secondary_color: preset.secondary,
                  accent_color: preset.action,
                  action_button_color: preset.action,
                  button_color: undefined,
                  sidebar_color: undefined
                })}
                className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-2 bg-white text-[11px] font-semibold text-slate-700 transition-colors ${
                  colors.primary === preset.primary && colors.secondary === preset.secondary
                    ? 'border-[#1845E8] ring-2 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="flex -space-x-1">
                  {[preset.primary, preset.secondary, preset.action].map(c => (
                    <span key={c} className="w-3.5 h-3.5 rounded-full border border-white" style={{ backgroundColor: c }} />
                  ))}
                </span>
                {preset.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4">
            <ColorField
              label="Cor principal"
              hint="Menu ativo, busca e destaques."
              value={colors.primary}
              onChange={(primary_color) => onChange({ primary_color })}
            />
            <ColorField
              label="Cor secundária"
              hint="Fundos escuros e detalhes."
              value={colors.secondary}
              onChange={(secondary_color) => onChange({ secondary_color })}
            />
            <ColorField
              label="Cor dos botões"
              hint="Botões principais (salvar, cadastrar, finalizar)."
              value={colors.button}
              onChange={(button_color) => onChange({ button_color })}
              inheritedFrom={value.button_color ? undefined : 'Segue a cor principal'}
              onReset={() => onChange({ button_color: undefined })}
            />
            <ColorField
              label="Cor da sidebar"
              hint="Fundo do menu lateral."
              value={colors.sidebar}
              onChange={(sidebar_color) => onChange({ sidebar_color })}
              inheritedFrom={value.sidebar_color ? undefined : 'Segue a cor secundária'}
              onReset={() => onChange({ sidebar_color: undefined })}
            />
            <ColorField
              label="Cor dos cards"
              hint="Fundo dos painéis e indicadores."
              value={colors.card}
              onChange={(card_color) => onChange({ card_color })}
              inheritedFrom={value.card_color ? undefined : 'Branco padrão'}
              onReset={() => onChange({ card_color: undefined })}
              warning={isDarkColor(colors.card) ? 'Cor escura: os textos dos cards são escuros e podem ficar ilegíveis.' : undefined}
            />
            <ColorField
              label="Cor dos botões de ação"
              hint="Filtros, seletores e atalhos ativos."
              value={colors.action}
              // A cor de destaque acompanha os botões de ação
              onChange={(c) => onChange({ action_button_color: c, accent_color: c })}
            />
          </div>
        </section>
      </div>

      {/* PRÉ-VISUALIZAÇÃO */}
      <div className="xl:col-span-2">
        <div className="xl:sticky xl:top-0 space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Pré-visualização do ambiente da loja
          </span>

          <div className="rounded-2xl border border-slate-200 overflow-hidden flex min-h-[300px] shadow-sm">
            <div className="w-[42%] p-3 flex flex-col gap-2 text-white" style={{ backgroundColor: colors.sidebar }}>
              <div className="h-10 flex items-center pb-2 border-b border-white/10">
                {value.logo_url ? (
                  <img src={value.logo_url} alt="" className="max-h-8 max-w-full object-contain" />
                ) : (
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0" style={{ backgroundColor: colors.primary }}>
                      {value.logo_compact_url
                        ? <img src={value.logo_compact_url} alt="" className="max-h-5 max-w-5 object-contain" />
                        : name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[10px] font-extrabold truncate">{name}</span>
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold" style={{ backgroundColor: colors.primary }}>
                <Smartphone className="w-3 h-3" />
                Estoque
              </span>
              <span className="px-2 py-1.5 rounded-lg text-[10px] text-white/50">Vendas</span>
              <span className="px-2 py-1.5 rounded-lg text-[10px] text-white/50">Clientes</span>
            </div>

            <div className="flex-1 p-3 bg-[#F4F6FA] space-y-2.5">
              <div className="h-6 rounded-full" style={{ backgroundColor: colors.primary }} />
              <div className="rounded-xl border border-slate-200 p-2.5 space-y-2" style={{ backgroundColor: colors.card }}>
                <span className="text-[9px] font-semibold uppercase text-slate-400 block">Vendas do mês</span>
                <span className="text-sm font-black text-slate-800 block">R$ 48.950,00</span>
                <div className="flex gap-1.5">
                  <span className="px-2 py-1 rounded-lg text-[9px] font-bold text-white" style={{ backgroundColor: colors.action }}>Pix</span>
                  <span className="px-2 py-1 rounded-lg text-[9px] font-bold text-slate-600 border border-slate-200">Cartão</span>
                </div>
              </div>
              <span className="block text-center px-2 py-1.5 rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: colors.button }}>
                Finalizar venda
              </span>
              <span className="block h-1.5 rounded-full" style={{ backgroundColor: colors.secondary }} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Aplicada automaticamente em todo o ambiente da loja. Somente o Super Administrador pode alterá-la.
          </p>
        </div>
      </div>
    </div>
  );
};
