// ============================================================================
// CONTROLPHONE — CADASTRO E CONFIGURAÇÃO DE LOJAS (REGRAS COMUNS)
// Catálogos (planos, situações, recursos, documentos), máscaras, validações e
// resolução das cores da identidade visual. Usado pelo assistente de criação
// e pela gestão posterior da loja.
// ============================================================================

import {
  TenantDocumentType, TenantFeatures, TenantPlan, TenantStatus, TenantTheme
} from '../types';

// ---- Planos e situação da assinatura ----

export const PLAN_OPTIONS: { id: TenantPlan; label: string; description: string }[] = [
  { id: 'starter', label: 'Starter', description: 'Operação enxuta: vendas, estoque e clientes.' },
  { id: 'professional', label: 'Professional', description: 'Equipe completa, assistência técnica e metas.' },
  { id: 'enterprise', label: 'Enterprise', description: 'Alto volume, suporte prioritário e personalização total.' }
];

export const STATUS_OPTIONS: { id: TenantStatus; label: string; badge: string }[] = [
  { id: 'active', label: 'Ativa', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'trial', label: 'Em Teste', badge: 'bg-blue-50 text-blue-700' },
  { id: 'suspended', label: 'Suspensa', badge: 'bg-rose-50 text-rose-700' },
  { id: 'cancelled', label: 'Cancelada', badge: 'bg-slate-100 text-slate-600' }
];

export const planLabel = (plan?: TenantPlan) => PLAN_OPTIONS.find(p => p.id === plan)?.label || 'Sem plano';

export const statusMeta = (status: TenantStatus) =>
  STATUS_OPTIONS.find(s => s.id === status) || { id: status, label: 'Inativa', badge: 'bg-slate-100 text-slate-600' };

/** Loja em funcionamento (ativa ou em teste) */
export const isTenantOperational = (status: TenantStatus) => status === 'active' || status === 'trial';

// ---- Recursos da loja ----

export const FEATURE_OPTIONS: { key: keyof TenantFeatures; label: string; description: string }[] = [
  { key: 'assistance', label: 'Trabalha com Assistência Técnica', description: 'Ordens de serviço, orçamentos e bancada.' },
  { key: 'upgrade', label: 'Trabalha com Upgrade', description: 'Aparelho usado do cliente como parte do pagamento.' },
  { key: 'imei_control', label: 'Controla estoque por IMEI', description: 'Cada aparelho é rastreado individualmente pelo IMEI.' },
  { key: 'gifts', label: 'Trabalha com Brindes', description: 'Brindes com custo abatido do lucro da venda.' },
  { key: 'accessories', label: 'Trabalha com Acessórios', description: 'Estoque e venda de acessórios por quantidade.' },
  { key: 'auto_warranty', label: 'Ativar Garantia Automática', description: 'A garantia é registrada no momento da venda.' },
  { key: 'send_whatsapp', label: 'Permitir envio de documentos por WhatsApp', description: 'Opção disponível nos menus de documentos.' },
  { key: 'send_email', label: 'Permitir envio por E-mail', description: 'Opção disponível nos menus de documentos.' }
];

// Lojas criadas antes destas configurações continuam com tudo habilitado
export const DEFAULT_FEATURES: TenantFeatures = {
  assistance: true,
  upgrade: true,
  imei_control: true,
  gifts: true,
  accessories: true,
  auto_warranty: true,
  send_whatsapp: true,
  send_email: true
};

// ---- Documentos personalizados ----

export const DOCUMENT_TYPES: { type: TenantDocumentType; label: string; required: boolean; description: string }[] = [
  { type: 'warranty_term', label: 'Modelo do Termo de Garantia', required: true, description: 'Entregue ao cliente em toda venda de aparelho.' },
  { type: 'service_order', label: 'Modelo da Ordem de Serviço da Assistência', required: true, description: 'Usado na entrada de aparelhos na assistência.' },
  { type: 'upgrade_contract', label: 'Modelo de Contrato de Upgrade', required: false, description: 'Declaração do aparelho recebido na troca.' },
  { type: 'sale_receipt', label: 'Modelo de Comprovante de Venda', required: false, description: 'Comprovante entregue ao final da venda.' }
];

export const documentLabel = (type: TenantDocumentType) =>
  DOCUMENT_TYPES.find(d => d.type === type)?.label || type;

// ---- Identidade visual ----

export const DEFAULT_COLORS = {
  primary: '#1845E8',
  secondary: '#0B0F17',
  accent: '#3B82F6',
  card: '#FFFFFF'
};

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  button: string;
  sidebar: string;
  card: string;
  action: string;
}

/** Cores efetivas do tema: as específicas herdam das principais quando não foram definidas. */
export const resolveThemeColors = (theme?: Partial<TenantTheme> | null): ThemeColors => {
  const primary = theme?.primary_color || DEFAULT_COLORS.primary;
  const secondary = theme?.secondary_color || DEFAULT_COLORS.secondary;
  const accent = theme?.accent_color || primary;
  return {
    primary,
    secondary,
    accent,
    button: theme?.button_color || primary,
    sidebar: theme?.sidebar_color || secondary,
    card: theme?.card_color || DEFAULT_COLORS.card,
    action: theme?.action_button_color || accent
  };
};

export const buildDefaultTheme = (tenantId: string, displayName: string): TenantTheme => ({
  id: 'theme-' + tenantId,
  tenant_id: tenantId,
  display_name: displayName,
  primary_color: DEFAULT_COLORS.primary,
  secondary_color: DEFAULT_COLORS.secondary,
  accent_color: DEFAULT_COLORS.accent,
  theme_mode: 'light',
  dashboard_style: 'reference',
  pdf_header_style: 'standard'
});

export const isHexColor = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

export const hexToRgbString = (hex: string): string => {
  let clean = (hex || DEFAULT_COLORS.primary).replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '24, 69, 232';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
};

/** true quando texto escuro perde legibilidade sobre a cor (usado para alertar na cor dos cards) */
export const isDarkColor = (hex: string): boolean => {
  const [r, g, b] = hexToRgbString(hex).split(',').map(n => Number(n.trim()));
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150;
};

export const BRAND_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
const BRAND_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const BRAND_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lê a imagem da marca e devolve um PNG reduzido (lado maior = maxSide), preservando transparência.
 * O original nunca é guardado: a identidade visual fica leve o bastante para acompanhar o tema.
 */
export const readBrandImage = (file: File, maxSide: number): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!BRAND_IMAGE_TYPES.includes(file.type)) {
      reject(new Error('Formato não suportado. Envie PNG, JPG, WEBP ou SVG.'));
      return;
    }
    if (file.size > BRAND_IMAGE_MAX_BYTES) {
      reject(new Error('A imagem excede o limite de 5 MB.'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || maxSide;
      const height = img.naturalHeight || maxSide;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler a imagem selecionada.'));
    };
    img.src = objectUrl;
  });

// ---- Máscaras ----

const digits = (v: string) => v.replace(/\D/g, '');

export const maskCNPJ = (v: string) => {
  const d = digits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export const maskCPF = (v: string) => {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
};

export const maskPhone = (v: string) => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const maskCEP = (v: string) => {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// ---- Validações ----

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const isValidPhone = (v: string) => {
  const len = digits(v).length;
  return len === 10 || len === 11;
};

const checkDigit = (base: string, weights: number[]) => {
  const sum = base.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
};

export const isValidCNPJ = (v: string) => {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const first = checkDigit(d.slice(0, 12), w1);
  const second = checkDigit(d.slice(0, 12) + first, [6, ...w1]);
  return d.endsWith(`${first}${second}`);
};

export const isValidCPF = (v: string) => {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const sum = d.slice(0, len).split('').reduce((acc, n, i) => acc + Number(n) * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
};

export const PASSWORD_MIN_LENGTH = 8;

export const passwordIssue = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'A senha deve combinar letras e números.';
  return null;
};

export const sameCnpj = (a?: string, b?: string) => Boolean(a && b) && digits(a!) === digits(b!);

// ---- CEP ----

export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/** Consulta o CEP no ViaCEP. Devolve null quando o CEP não existe; lança erro se o serviço estiver fora. */
export const lookupCep = async (cep: string, signal?: AbortSignal): Promise<CepAddress | null> => {
  const clean = digits(cep);
  if (clean.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal });
  if (!res.ok) throw new Error('Serviço de CEP indisponível.');
  const data = await res.json();
  if (data.erro) return null;
  return {
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || ''
  };
};

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export const formatDateBR = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const formatDateTimeBR = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const formatFileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
