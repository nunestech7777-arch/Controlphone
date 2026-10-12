// ============================================================================
// CONTROLPHONE — MOTOR DE DADOS E PERSISTÊNCIA MULTI-TENANT
// ============================================================================

import {
  Tenant, TenantTheme, UserProfile, Device, Accessory, Gift,
  Customer, Supplier, SupplierPurchase, Sale, TradeIn, ServiceOrder, InternalRepair,
  Expense, SalesGoal, AuditLog, SupportSession, PaymentMethod, DeviceMovement, MovementType, OSStatus,
  TenantSettings, Warranty, ReturnRequest, ReturnResolution, CustomerCredit, SaleItem, ExpenseCategory,
  TenantDocument, TenantDocumentType, TenantFeatures, TenantPlan, TenantStatus
} from '../types';
import { DEFAULT_FEATURES, buildDefaultTheme, isTenantOperational, sameCnpj } from './tenantSetup';

import {
  pushCustomers, pushDocument, pushSettings, pushSuppliers, pushTenant, pushTheme, removeDocument, removeSupplierRemote
} from './realSync';

export interface AssistanceResult {
  ok: boolean;
  error?: string;
  order?: ServiceOrder;
}

const fail = (error: string): AssistanceResult => ({ ok: false, error });

// Usuário informado no cadastro de uma loja. A senha segue para o provedor de autenticação
// e NUNCA é gravada no estado local nem nos registros de auditoria.
export interface TenantSetupUser {
  full_name: string;
  email: string;
  phone?: string;
  cpf?: string;
  password: string;
}

export interface TenantSetupPayload {
  tenantId: string;
  company: Pick<Tenant,
    'name' | 'trade_name' | 'cnpj' | 'state_registration' | 'email' | 'phone' | 'whatsapp' | 'website'
    | 'address_zipcode' | 'address_street' | 'address_number' | 'address_complement'
    | 'address_neighborhood' | 'address_city' | 'address_state'>;
  theme: Omit<TenantTheme, 'id' | 'tenant_id'>;
  admin: TenantSetupUser;
  sellers: TenantSetupUser[];
  technicians: TenantSetupUser[];
  features: TenantFeatures;
  plan?: TenantPlan;
  planStartDate?: string;
  planDueDate?: string;
  status: TenantStatus;
  notes?: string;
  documents: TenantDocument[];
}

export interface TenantSetupResult {
  tenant: Tenant;
  admin: UserProfile;
  sellers: number;
  technicians: number;
}

/** Dados de identidade lidos do Supabase no login real (ver lib/realSession). */
export interface RealIdentity {
  /** Separa os dados locais por loja (ou "plataforma" para o Super Admin) */
  scope: string;
  tenants: Tenant[];
  themes: Record<string, TenantTheme>;
  profiles: UserProfile[];
  tenantSettings: Record<string, TenantSettings>;
  tenantDocuments: TenantDocument[];
}

export interface OpResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}
const opFail = <T = undefined>(error: string): OpResult<T> => ({ ok: false, error });

// Garantia FIXA de 90 dias (garantia legal do CDC para bem durável, como no Termo de Garantia da loja)
export const WARRANTY_DAYS = 90;
export const DEFAULT_WARRANTY_TERMS =
  'Garantia comercial da loja contra defeitos de funcionamento do aparelho. Não cobre danos por queda, ' +
  'contato com líquidos, mau uso ou reparo por terceiros. Esta garantia comercial soma-se aos direitos ' +
  'legais do consumidor previstos no CDC e não os substitui nem reduz.';

// Datas de garantia em dia local da loja ('YYYY-MM-DD'), dias corridos
export const isUuid = (v?: string) => Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
// Identificador no formato do banco, para o registro poder ser gravado no servidor
export const newUuid = () => crypto.randomUUID();

export type CustomerInput = Pick<Customer, 'name' | 'phone'> &
  Partial<Pick<Customer, 'whatsapp' | 'email' | 'cpf' | 'birth_date' | 'address' | 'notes'>>;
export type SupplierInput = Pick<Supplier, 'name' | 'phone'> &
  Partial<Pick<Supplier, 'company_name' | 'whatsapp' | 'email' | 'cpf_cnpj' | 'address' | 'notes'>>;

export const toLocalDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (day: string, days: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return toLocalDay(new Date(y, m - 1, d + days));
};
const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100);

// IMEI sempre comparado só pelos dígitos (espaços, traços e pontos digitados não criam duplicidade)
export const normalizeImei = (v?: string) => (v || '').replace(/\D/g, '');
export const isValidImei = (v?: string) => normalizeImei(v).length === 15;
export const IMEI_HINT = 'O IMEI deve ter 15 dígitos.';
const uid = (prefix: string) => prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

const STORAGE_KEY = 'controlphone_state_v1';

// Dados Iniciais Realistas
const initialTenants: Tenant[] = [
  {
    id: 'tenant-itech-01',
    name: 'iTech Prime Comércio de Celulares LTDA',
    trade_name: 'iTech Concept Prime',
    cnpj: '12.345.678/0001-90',
    email: 'contato@itechprime.com.br',
    phone: '(11) 98765-4321',
    address_street: 'Avenida Paulista',
    address_number: '1578',
    address_city: 'São Paulo',
    address_state: 'SP',
    status: 'active',
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'tenant-barra-02',
    name: 'Barra Celulares & Serviços LTDA',
    trade_name: 'Barra Phone Premium',
    cnpj: '98.765.432/0001-10',
    email: 'contato@barraphone.com.br',
    phone: '(21) 99887-7665',
    address_street: 'Avenida das Américas',
    address_number: '4666',
    address_city: 'Rio de Janeiro',
    address_state: 'RJ',
    status: 'active',
    created_at: '2026-02-15T14:30:00Z',
  }
];

const initialThemes: Record<string, TenantTheme> = {
  'tenant-itech-01': {
    id: 'theme-01',
    tenant_id: 'tenant-itech-01',
    display_name: 'iTech Concept Prime',
    primary_color: '#1845E8', // Royal Blue da imagem de referência
    secondary_color: '#0B0F17',
    accent_color: '#3B82F6',
    theme_mode: 'light',
    dashboard_style: 'reference',
    pdf_header_style: 'standard'
  },
  'tenant-barra-02': {
    id: 'theme-02',
    tenant_id: 'tenant-barra-02',
    display_name: 'Barra Phone Premium',
    primary_color: '#D97706', // Dourado luxo
    secondary_color: '#18181B', // Preto graphite
    accent_color: '#F59E0B',
    theme_mode: 'light',
    dashboard_style: 'reference',
    pdf_header_style: 'standard'
  }
};

const initialProfiles: UserProfile[] = [
  {
    id: 'user-superadmin-01',
    tenant_id: null,
    role: 'super_admin',
    full_name: 'Administrador Geral Controlphone',
    email: 'superadmin@controlphone.com',
    phone: '(11) 90000-0000',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'user-admin-01',
    tenant_id: 'tenant-itech-01',
    role: 'admin',
    full_name: 'Robert William',
    email: 'robert@itechprime.com.br',
    phone: '(11) 98888-1111',
    is_active: true,
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'user-seller-01',
    tenant_id: 'tenant-itech-01',
    role: 'seller',
    full_name: 'Lucas Mendes',
    email: 'lucas.vendas@itechprime.com.br',
    phone: '(11) 98888-2222',
    is_active: true,
    created_at: '2026-01-15T09:00:00Z'
  },
  {
    id: 'user-seller-02',
    tenant_id: 'tenant-itech-01',
    role: 'seller',
    full_name: 'Amanda Souza',
    email: 'amanda.vendas@itechprime.com.br',
    phone: '(11) 98888-3333',
    is_active: true,
    created_at: '2026-02-01T09:00:00Z'
  },
  {
    id: 'user-tech-01',
    tenant_id: 'tenant-itech-01',
    role: 'technician',
    full_name: 'Diego Fonseca',
    email: 'diego.tecnico@itechprime.com.br',
    phone: '(11) 98888-4444',
    is_active: true,
    created_at: '2026-01-15T09:00:00Z'
  }
];

const initialCustomers: Customer[] = [
  {
    id: 'cust-01',
    tenant_id: 'tenant-itech-01',
    name: 'Carlos Eduardo Silva',
    phone: '(11) 97777-1111',
    whatsapp: '(11) 97777-1111',
    email: 'carlos.silva@email.com',
    cpf: '123.456.789-00',
    birth_date: '1992-10-15',
    address: 'Rua Bela Cintra, 890 - Jardins, São Paulo',
    created_at: '2026-02-01T10:00:00Z'
  },
  {
    id: 'cust-02',
    tenant_id: 'tenant-itech-01',
    name: 'Mariana Duarte Costa',
    phone: '(11) 97777-2222',
    whatsapp: '(11) 97777-2222',
    email: 'mariana.costa@email.com',
    cpf: '234.567.890-11',
    birth_date: '1995-10-11', // Aniversariante do dia/mês
    address: 'Alameda Santos, 1200 - Cerqueira César, São Paulo',
    created_at: '2026-02-10T11:00:00Z'
  },
  {
    id: 'cust-03',
    tenant_id: 'tenant-itech-01',
    name: 'Rodrigo Albuquerque',
    phone: '(11) 97777-3333',
    whatsapp: '(11) 97777-3333',
    email: 'rodrigo.albuquerque@email.com',
    cpf: '345.678.901-22',
    birth_date: '1988-05-20',
    address: 'Rua Oscar Freire, 450 - São Paulo',
    created_at: '2026-03-01T15:00:00Z'
  }
];

const initialSuppliers: Supplier[] = [
  {
    id: 'sup-01',
    tenant_id: 'tenant-itech-01',
    name: 'Distribuidora Apple Miami Import',
    company_name: 'Miami Imports LTDA',
    phone: '(11) 96666-0001',
    whatsapp: '(11) 96666-0001',
    email: 'pedidos@miamiimport.com',
    cpf_cnpj: '22.333.444/0001-55',
    address: 'Rua Santa Ifigênia, 295 - Centro, São Paulo - SP',
    created_at: '2026-01-05T10:00:00Z'
  },
  {
    id: 'sup-02',
    tenant_id: 'tenant-itech-01',
    name: 'Marcos Tavares',
    company_name: 'Atacado Cell Acessórios',
    phone: '(11) 95555-0002',
    whatsapp: '(11) 95555-0002',
    email: 'vendas@atacadocell.com',
    cpf_cnpj: '33.444.555/0001-66',
    notes: 'Pedido mínimo de R$ 500,00. Entrega em até 3 dias úteis.',
    created_at: '2026-01-08T10:00:00Z'
  }
];

const initialDevices: Device[] = [
  {
    id: 'dev-01',
    tenant_id: 'tenant-itech-01',
    imei: '354892091823712',
    brand: 'Apple',
    model: 'iPhone 15 Pro Max',
    storage_capacity: '256GB',
    color: 'Titânio Natural',
    battery_health: 98,
    physical_condition_notes: 'Impecável sem marcas ou riscos. Tela 100% original.',
    supplier_id: 'sup-01',
    origin: 'purchase',
    acquisition_cost: 5400.00,
    accumulated_repair_cost: 0.00,
    suggested_price: 6890.00,
    status: 'available',
    entry_date: '2026-09-01T10:00:00Z',
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'dev-02',
    tenant_id: 'tenant-itech-01',
    imei: '354892091823713',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    storage_capacity: '128GB',
    color: 'Titânio Azul',
    battery_health: 94,
    physical_condition_notes: 'Pequena marca quase imperceptível na quina inferior.',
    supplier_id: 'sup-01',
    origin: 'purchase',
    acquisition_cost: 4600.00,
    accumulated_repair_cost: 0.00,
    suggested_price: 5890.00,
    status: 'available',
    entry_date: '2026-09-05T14:00:00Z',
    created_at: '2026-09-05T14:00:00Z'
  },
  {
    id: 'dev-03',
    tenant_id: 'tenant-itech-01',
    imei: '354892091823714',
    brand: 'Apple',
    model: 'iPhone 14 Pro Max',
    storage_capacity: '256GB',
    color: 'Roxo Profundo',
    battery_health: 89,
    physical_condition_notes: 'Bateria trocada em manutenção interna autorizada.',
    origin: 'trade_in',
    acquisition_cost: 3800.00,
    accumulated_repair_cost: 220.00, // Custo da bateria incorporado
    suggested_price: 4990.00,
    status: 'available',
    entry_date: '2026-09-12T16:00:00Z',
    created_at: '2026-09-12T16:00:00Z'
  },
  {
    id: 'dev-04',
    tenant_id: 'tenant-itech-01',
    imei: '354892091823715',
    brand: 'Apple',
    model: 'iPhone 13',
    storage_capacity: '128GB',
    color: 'Estelar',
    battery_health: 91,
    physical_condition_notes: 'Aparelho em excelente estado geral.',
    supplier_id: 'sup-01',
    origin: 'purchase',
    acquisition_cost: 2600.00,
    accumulated_repair_cost: 0.00,
    suggested_price: 3390.00,
    status: 'sold',
    entry_date: '2026-08-20T10:00:00Z',
    sold_at: '2026-10-05T15:20:00Z',
    created_at: '2026-08-20T10:00:00Z'
  },
  {
    id: 'dev-05',
    tenant_id: 'tenant-itech-01',
    imei: '354892091823716',
    brand: 'Apple',
    model: 'iPhone 12',
    storage_capacity: '64GB',
    color: 'Preto',
    battery_health: 79,
    physical_condition_notes: 'Necessita troca de bateria e revisão de alto-falante.',
    origin: 'trade_in',
    acquisition_cost: 1400.00,
    accumulated_repair_cost: 0.00,
    suggested_price: 2190.00,
    status: 'in_maintenance', // Em manutenção interna na bancada
    entry_date: '2026-10-08T11:00:00Z',
    created_at: '2026-10-08T11:00:00Z'
  }
];

const initialAccessories: Accessory[] = [
  {
    id: 'acc-01',
    tenant_id: 'tenant-itech-01',
    name: 'Carregador Rápido 20W USB-C Homologado',
    category: 'Carregadores',
    barcode: '789123456001',
    quantity: 45,
    unit_cost: 32.00,
    sale_price: 119.00,
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'acc-02',
    tenant_id: 'tenant-itech-01',
    name: 'Cabo Trançado USB-C para Lightning 1.5m',
    category: 'Cabos',
    barcode: '789123456002',
    quantity: 60,
    unit_cost: 18.00,
    sale_price: 79.00,
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'acc-03',
    tenant_id: 'tenant-itech-01',
    name: 'Película de Vidro 9D com Borda Reforçada',
    category: 'Películas',
    barcode: '789123456003',
    quantity: 110,
    unit_cost: 9.00,
    sale_price: 59.00,
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'acc-04',
    tenant_id: 'tenant-itech-01',
    name: 'Capa Magnética Silicone Case MagSafe',
    category: 'Capas',
    barcode: '789123456004',
    quantity: 38,
    unit_cost: 25.00,
    sale_price: 99.00,
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  }
];

const initialGifts: Gift[] = [
  {
    id: 'gift-01',
    tenant_id: 'tenant-itech-01',
    name: 'Kit Brinde Boas-Vindas (Película + Capa Simples)',
    category: 'Brindes VIP',
    quantity: 50,
    unit_cost: 24.00, // Custo absorvido pela loja no fechamento
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'gift-02',
    tenant_id: 'tenant-itech-01',
    name: 'Flanela Microfibra Personalizada Controlphone',
    category: 'Brindes Acessórios',
    quantity: 150,
    unit_cost: 4.50,
    supplier_id: 'sup-02',
    created_at: '2026-01-10T10:00:00Z'
  }
];

const initialSales: Sale[] = [
  {
    id: 'sale-01',
    tenant_id: 'tenant-itech-01',
    sale_number: 1042,
    seller_id: 'user-seller-01',
    customer_id: 'cust-01',
    sales_origin: 'Instagram',
    subtotal: 3390.00,
    discount_amount: 100.00,
    total_amount: 3290.00,
    total_cost: 2600.00,
    gross_profit: 690.00,
    status: 'completed',
    created_at: '2026-10-05T15:20:00Z',
    items: [
      {
        id: 'item-01',
        sale_id: 'sale-01',
        item_type: 'device',
        device_id: 'dev-04',
        quantity: 1,
        unit_cost: 2600.00,
        unit_price: 3390.00,
        discount: 100.00,
        total_price: 3290.00
      }
    ],
    payments: [
      {
        id: 'pay-01',
        sale_id: 'sale-01',
        payment_method: 'pix',
        amount: 3290.00,
        installments: 1,
        received_at: '2026-10-05T15:20:00Z'
      }
    ],
    gifts: [
      {
        id: 'sgift-01',
        sale_id: 'sale-01',
        gift_id: 'gift-01',
        quantity: 1,
        unit_cost: 24.00
      }
    ]
  }
];

const initialTradeIns: TradeIn[] = [
  {
    id: 'trade-01',
    tenant_id: 'tenant-itech-01',
    customer_id: 'cust-02',
    seller_id: 'user-seller-01',
    sold_device_id: 'dev-04',
    received_device_id: 'dev-03',
    appraisal_value: 3800.00, // Custo de aquisição do iPhone 14 Pro Max recebido
    sold_device_price: 6890.00,
    difference_amount: 3090.00,
    payment_method: 'credit_card',
    status: 'completed',
    created_at: '2026-09-12T16:00:00Z'
  }
];

const initialServiceOrders: ServiceOrder[] = [
  {
    id: 'os-01',
    tenant_id: 'tenant-itech-01',
    os_number: 501,
    origin: 'external',
    customer_id: 'cust-03',
    intake_seller_id: 'user-seller-01',
    assigned_technician_id: 'user-tech-01',
    device_brand: 'Apple',
    device_model: 'iPhone 14 Pro',
    imei: '354892091999888',
    reported_defect: 'Aparelho caiu na piscina e parou de carregar; tela piscando em verde.',
    physical_condition: 'Vidro traseiro trincado no canto superior esquerdo.',
    status: 'quote_ready', // Técnico lançou custos e Admin definiu orçamento
    technician_diagnosis: 'Oxidação severa no conector dock e curto no barramento do display OLED.',
    technician_parts_cost: 380.00, // Custo de peças lançado pelo técnico
    technician_service_cost: 150.00, // Custo de mão de obra técnica
    client_quote_amount: 890.00, // Definido EXCLUSIVAMENTE pelo Admin
    estimated_delivery_date: '2026-10-14',
    created_at: '2026-10-09T10:30:00Z'
  },
  {
    id: 'os-02',
    tenant_id: 'tenant-itech-01',
    os_number: 502,
    origin: 'external',
    customer_id: 'cust-01',
    intake_seller_id: 'user-seller-02',
    assigned_technician_id: 'user-tech-01',
    device_brand: 'Apple',
    device_model: 'iPhone 13 Pro Max',
    imei: '354892091777666',
    reported_defect: 'Bateria dura menos de 3 horas, saúde em 74%.',
    physical_condition: 'Excelente estado, pequenas marcas normais de uso.',
    status: 'ready_for_pickup', // Reparo pronto, aguardando vendedor entregar e cobrar
    technician_diagnosis: 'Troca de módulo de bateria por componente original homologado com chip BMS.',
    technician_parts_cost: 190.00,
    technician_service_cost: 80.00,
    client_quote_amount: 450.00,
    quote_approved_at: '2026-10-09T14:00:00Z',
    created_at: '2026-10-09T11:00:00Z'
  }
];

const initialInternalRepairs: InternalRepair[] = [
  {
    id: 'irep-01',
    tenant_id: 'tenant-itech-01',
    device_id: 'dev-05',
    technician_id: 'user-tech-01',
    issue_description: 'Revisão geral do iPhone 12 recebido em troca (saúde 79% e som baixo).',
    diagnosis: 'Substituição preventiva da bateria e limpeza ultrassônica do auricular.',
    parts_used: 'Bateria iFix Premium iPhone 12 + Malha do auricular',
    repair_cost: 180.00,
    status: 'in_progress',
    created_at: '2026-10-08T14:00:00Z'
  }
];

const initialExpenses: Expense[] = [
  {
    id: 'exp-01',
    tenant_id: 'tenant-itech-01',
    category: 'rent',
    description: 'Aluguel Loja Física Paulista',
    amount: 6500.00,
    due_date: '2026-10-10',
    payment_date: '2026-10-08',
    payment_method: 'pix',
    status: 'paid',
    created_by: 'user-admin-01',
    created_at: '2026-10-01T10:00:00Z'
  },
  {
    id: 'exp-02',
    tenant_id: 'tenant-itech-01',
    category: 'internet_telecom',
    description: 'Fibra Dedicada + Telefonia VoIP',
    amount: 380.00,
    due_date: '2026-10-15',
    status: 'pending',
    created_by: 'user-admin-01',
    created_at: '2026-10-01T10:00:00Z'
  },
  {
    id: 'exp-03',
    tenant_id: 'tenant-itech-01',
    category: 'marketing_ads',
    description: 'Campanha Meta Ads Instagram & Reels iPhone 15',
    amount: 1200.00,
    due_date: '2026-10-05',
    payment_date: '2026-10-05',
    payment_method: 'credit_card',
    status: 'paid',
    created_by: 'user-admin-01',
    created_at: '2026-10-01T10:00:00Z'
  }
];

const initialGoals: SalesGoal[] = [
  {
    id: 'goal-01',
    tenant_id: 'tenant-itech-01',
    seller_id: 'user-seller-01',
    month_year: '2026-10',
    target_device_count: 15
  },
  {
    id: 'goal-02',
    tenant_id: 'tenant-itech-01',
    seller_id: 'user-seller-02',
    month_year: '2026-10',
    target_device_count: 12
  }
];

const initialAuditLogs: AuditLog[] = [
  {
    id: 'log-01',
    tenant_id: 'tenant-itech-01',
    user_id: 'user-admin-01',
    user_email: 'robert@itechprime.com.br',
    user_role: 'admin',
    action: 'ENTRADA_ESTOQUE',
    module: 'Estoque',
    record_id: 'dev-01',
    details: { imei: '354892091823712', modelo: 'iPhone 15 Pro Max 256GB' },
    ip_address: '189.120.45.10',
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'log-02',
    tenant_id: 'tenant-itech-01',
    user_id: 'user-seller-01',
    user_email: 'lucas.vendas@itechprime.com.br',
    user_role: 'seller',
    action: 'VENDA_CONCLUIDA',
    module: 'Vendas',
    record_id: 'sale-01',
    details: { venda_numero: 1042, total: 3290.00, canal: 'Instagram' },
    ip_address: '189.120.45.12',
    created_at: '2026-10-05T15:20:00Z'
  }
];

// Classe ControlphoneStore com sincronização reativa
class ControlphoneStore {
  tenants: Tenant[] = initialTenants;
  themes: Record<string, TenantTheme> = initialThemes;
  profiles: UserProfile[] = initialProfiles;
  customers: Customer[] = initialCustomers;
  suppliers: Supplier[] = initialSuppliers;
  supplierPurchases: SupplierPurchase[] = [];
  devices: Device[] = initialDevices;
  accessories: Accessory[] = initialAccessories;
  gifts: Gift[] = initialGifts;
  sales: Sale[] = initialSales;
  tradeIns: TradeIn[] = initialTradeIns;
  serviceOrders: ServiceOrder[] = initialServiceOrders;
  internalRepairs: InternalRepair[] = initialInternalRepairs;
  expenses: Expense[] = initialExpenses;
  goals: SalesGoal[] = initialGoals;
  auditLogs: AuditLog[] = initialAuditLogs;
  supportSessions: SupportSession[] = [];
  deviceMovements: DeviceMovement[] = [];
  tenantSettings: Record<string, TenantSettings> = {};
  warranties: Warranty[] = [];
  returnRequests: ReturnRequest[] = [];
  customerCredits: CustomerCredit[] = [];
  tenantDocuments: TenantDocument[] = [];

  private listeners: Set<() => void> = new Set();

  /**
   * Clientes e fornecedores já vão para o banco. Aqui ficam os ids que ainda não chegaram lá
   * (sem internet, por exemplo); o envio é refeito na próxima sincronização.
   */
  unsynced: { customers: string[]; suppliers: string[] } = { customers: [], suppliers: [] };
  /** true enquanto houver cadastro que não pôde ser enviado ao servidor */
  get hasUnsynced() {
    return this.unsynced.customers.length + this.unsynced.suppliers.length > 0;
  }

  /** true quando a última gravação no navegador falhou (ex.: armazenamento cheio). A tela avisa e pede ação. */
  saveFailed = false;

  // Modo real: conta, loja e equipe vêm do Supabase; os demais cadastros ficam em uma
  // chave própria do navegador (separada da demonstração) até cada módulo ser migrado.
  isRealMode = false;
  private storageKey = STORAGE_KEY;

  constructor() {
    this.loadFromStorage();
  }

  private resetCollections(useDemoSeed: boolean) {
    this.tenants = useDemoSeed ? initialTenants : [];
    this.themes = useDemoSeed ? initialThemes : {};
    this.profiles = useDemoSeed ? initialProfiles : [];
    this.customers = useDemoSeed ? initialCustomers : [];
    this.suppliers = useDemoSeed ? initialSuppliers : [];
    this.supplierPurchases = [];
    this.devices = useDemoSeed ? initialDevices : [];
    this.accessories = useDemoSeed ? initialAccessories : [];
    this.gifts = useDemoSeed ? initialGifts : [];
    this.sales = useDemoSeed ? initialSales : [];
    this.tradeIns = useDemoSeed ? initialTradeIns : [];
    this.serviceOrders = useDemoSeed ? initialServiceOrders : [];
    this.internalRepairs = useDemoSeed ? initialInternalRepairs : [];
    this.expenses = useDemoSeed ? initialExpenses : [];
    this.goals = useDemoSeed ? initialGoals : [];
    this.auditLogs = useDemoSeed ? initialAuditLogs : [];
    this.supportSessions = [];
    this.deviceMovements = [];
    this.tenantSettings = {};
    this.warranties = [];
    this.returnRequests = [];
    this.customerCredits = [];
    this.tenantDocuments = [];
    this.unsynced = { customers: [], suppliers: [] };
  }

  /** Entra no modo real com a conta, as lojas e a equipe lidas do Supabase. */
  enterRealMode(identity: RealIdentity) {
    this.isRealMode = true;
    this.storageKey = `${STORAGE_KEY}_real_${identity.scope}`;
    this.resetCollections(false);
    this.loadFromStorage();

    // Fotos ainda são guardadas neste navegador: preserva a que já foi escolhida aqui
    const localProfiles = this.profiles;
    this.tenants = identity.tenants;
    this.themes = identity.themes;
    this.profiles = identity.profiles.map(p => {
      const local = localProfiles.find(l => l.id === p.id);
      return {
        ...p,
        avatar_url: p.avatar_url || local?.avatar_url,
        avatar_path: p.avatar_path || local?.avatar_path,
        last_access_at: p.last_access_at || local?.last_access_at
      };
    });
    this.tenantSettings = { ...this.tenantSettings, ...identity.tenantSettings };
    this.tenantDocuments = identity.tenantDocuments;
    this.saveToStorage();
  }

  /** Volta para os dados de demonstração (seed local). */
  enterDemoMode() {
    this.isRealMode = false;
    this.storageKey = STORAGE_KEY;
    this.resetCollections(true);
    this.loadFromStorage();
    this.notify();
  }

  private loadFromStorage() {
    let hasPurchaseHistory = false;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tenants) this.tenants = parsed.tenants;
        if (parsed.themes) this.themes = parsed.themes;
        if (parsed.profiles) this.profiles = parsed.profiles;
        if (parsed.customers) this.customers = parsed.customers;
        if (parsed.suppliers) this.suppliers = parsed.suppliers;
        if (parsed.supplierPurchases) {
          this.supplierPurchases = parsed.supplierPurchases;
          hasPurchaseHistory = true;
        }
        if (parsed.devices) this.devices = parsed.devices;
        if (parsed.accessories) this.accessories = parsed.accessories;
        if (parsed.gifts) this.gifts = parsed.gifts;
        if (parsed.sales) this.sales = parsed.sales;
        if (parsed.tradeIns) this.tradeIns = parsed.tradeIns;
        if (parsed.serviceOrders) this.serviceOrders = parsed.serviceOrders;
        if (parsed.internalRepairs) this.internalRepairs = parsed.internalRepairs;
        if (parsed.expenses) this.expenses = parsed.expenses;
        if (parsed.goals) this.goals = parsed.goals;
        if (parsed.auditLogs) this.auditLogs = parsed.auditLogs;
        if (parsed.supportSessions) this.supportSessions = parsed.supportSessions;
        if (parsed.deviceMovements) this.deviceMovements = parsed.deviceMovements;
        if (parsed.tenantSettings) this.tenantSettings = parsed.tenantSettings;
        if (parsed.warranties) this.warranties = parsed.warranties;
        if (parsed.returnRequests) this.returnRequests = parsed.returnRequests;
        if (parsed.customerCredits) this.customerCredits = parsed.customerCredits;
        if (parsed.tenantDocuments) this.tenantDocuments = parsed.tenantDocuments;
        if (parsed.unsynced) this.unsynced = { customers: parsed.unsynced.customers || [], suppliers: parsed.unsynced.suppliers || [] };
      }
    } catch (e) {
      console.warn('Erro ao carregar dados do localStorage:', e);
    }
    // Estados salvos antes do módulo Fornecedores: reconstrói o histórico a partir do estoque vinculado
    if (!hasPurchaseHistory) this.supplierPurchases = this.buildPurchasesFromStock();
    this.normalizeLegacyData();
  }

  // Estados salvos antes do fluxo de assistência interna/externa: completa os campos novos sem apagar nada
  private normalizeLegacyData() {
    this.devices.forEach(d => {
      delete (d as unknown as Record<string, unknown>).condition;
    });

    this.serviceOrders.forEach(o => {
      if (!o.origin) o.origin = 'external';
      if (!o.entered_at) o.entered_at = o.created_at;
      if (o.status === 'delivered' && !o.closed_at) o.closed_at = o.delivered_at || o.created_at;
      if (o.status === 'delivered' && !o.payment_status) o.payment_status = 'paid';
    });

    // Cada manutenção interna passa a ter uma OS interna espelho (mesma regra de origem/destino)
    this.internalRepairs.forEach(r => {
      if (r.service_order_id) return;
      const device = this.devices.find(d => d.id === r.device_id);
      if (!device) return;
      const done = r.status === 'completed';
      const os: ServiceOrder = {
        id: 'os-int-' + r.id,
        tenant_id: r.tenant_id,
        os_number: this.nextOsNumber(),
        origin: 'internal',
        device_id: device.id,
        intake_seller_id: r.technician_id,
        assigned_technician_id: r.technician_id,
        device_brand: device.brand,
        device_model: device.model,
        device_storage: device.storage_capacity,
        device_color: device.color,
        imei: device.imei,
        reported_defect: r.issue_description,
        technician_diagnosis: r.diagnosis,
        parts_used: r.parts_used,
        service_performed: r.diagnosis,
        status: done ? 'repair_completed' : 'in_maintenance',
        technician_parts_cost: Number(r.repair_cost) || 0,
        technician_service_cost: 0,
        entered_at: r.created_at,
        completed_at: r.completed_at,
        closed_at: done ? (r.completed_at || r.created_at) : undefined,
        created_at: r.created_at
      };
      this.serviceOrders.unshift(os);
      r.service_order_id = os.id;
    });

    // Upgrades antigos (sem venda): viram vendas normais na sequência de numeração
    [...this.tradeIns]
      .filter(t => !t.sale_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach(t => {
        const sold = this.devices.find(d => d.id === t.sold_device_id);
        const saleId = 'sale-up-' + t.id;
        const credit = Math.min(Number(t.appraisal_value), Number(t.sold_device_price));
        const difference = Math.round((Number(t.sold_device_price) - credit) * 100) / 100;
        const cost = sold ? Number(sold.acquisition_cost) + Number(sold.accumulated_repair_cost) : 0;
        const item: SaleItem = {
          id: `sitem-${saleId}-0`, sale_id: saleId, item_type: 'device', device_id: t.sold_device_id, quantity: 1,
          unit_cost: cost, unit_price: Number(t.sold_device_price), discount: 0, total_price: Number(t.sold_device_price)
        };
        const sale: Sale = {
          id: saleId, tenant_id: t.tenant_id,
          sale_number: Math.max(1000, ...this.sales.map(s => s.sale_number)) + 1,
          seller_id: t.seller_id, customer_id: t.customer_id, sales_origin: 'Não informada',
          subtotal: Number(t.sold_device_price), discount_amount: 0, total_amount: Number(t.sold_device_price),
          total_cost: cost, gross_profit: Number(t.sold_device_price) - cost,
          status: t.status === 'cancelled' ? 'cancelled' : 'completed',
          trade_in_id: t.id, created_at: t.created_at,
          items: [item],
          payments: [
            ...(credit > 0 ? [{ id: `spay-${saleId}-0`, sale_id: saleId, payment_method: 'trade_in_credit' as PaymentMethod, amount: credit, installments: 1, received_at: t.created_at }] : []),
            ...(difference > 0 ? [{ id: `spay-${saleId}-1`, sale_id: saleId, payment_method: t.payment_method, amount: difference, installments: 1, received_at: t.created_at }] : [])
          ],
          gifts: []
        };
        this.sales.unshift(sale);
        t.sale_id = saleId;
        // Garantia registrada antes (vinculada ao upgrade) passa a apontar para a venda e o item
        this.warranties.filter(w => w.trade_in_id === t.id).forEach(w => {
          w.sale_id = saleId;
          w.sale_item_id = item.id;
          w.trade_in_id = undefined;
        });
      });

    // Vendas concluídas anteriores ao módulo de garantias: uma garantia por aparelho vendido
    this.sales.forEach(sale => {
      if (sale.status !== 'completed') return;
      (sale.items || []).forEach(item => this.ensureWarrantyForItem(sale, item));
    });

    // Garantia passou a ser fixa em 90 dias: prazos ativos menores sobem para 90 (nunca se reduz um prazo)
    this.warranties.forEach(w => {
      if (w.status !== 'active' || w.warranty_days >= WARRANTY_DAYS) return;
      const previous = w.warranty_days;
      w.warranty_days = WARRANTY_DAYS;
      if (w.end_date < addDays(w.start_date, WARRANTY_DAYS)) w.end_date = addDays(w.start_date, WARRANTY_DAYS);
      w.history.push(this.event(`Prazo ajustado de ${previous} para ${WARRANTY_DAYS} dias (garantia fixa de 90 dias)`));
    });

    if (this.deviceMovements.length === 0) {
      this.devices.forEach(d => {
        this.deviceMovements.push({
          id: 'mov-entry-' + d.id, tenant_id: d.tenant_id, device_id: d.id, imei: d.imei,
          movement_type: 'stock_entry', description: 'Aparelho cadastrado no estoque',
          to_status: 'available', cost: Number(d.acquisition_cost), created_at: d.entry_date
        });
        if (d.status === 'sold' && d.sold_at) {
          this.deviceMovements.push({
            id: 'mov-sold-' + d.id, tenant_id: d.tenant_id, device_id: d.id, imei: d.imei,
            movement_type: 'sold', description: 'Aparelho vendido',
            from_status: 'available', to_status: 'sold', created_at: d.sold_at
          });
        }
      });
    }
  }

  // Papel real de quem executou a operação (o administrador também vende e atende no balcão)
  private roleOf(userId: string): string {
    return this.profiles.find(p => p.id === userId)?.role || 'seller';
  }

  private nextOsNumber(): number {
    return Math.max(500, ...this.serviceOrders.map(o => o.os_number)) + 1;
  }

  // --- RASTREABILIDADE DE MOVIMENTAÇÕES ---

  recordMovement(m: Omit<DeviceMovement, 'id' | 'created_at' | 'user_name'>) {
    this.deviceMovements.unshift({
      ...m,
      id: 'mov-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      user_name: this.profiles.find(p => p.id === m.user_id)?.full_name,
      created_at: new Date().toISOString()
    });
  }

  getDeviceMovements(deviceId: string): DeviceMovement[] {
    return this.chronological(this.deviceMovements.filter(m => m.device_id === deviceId));
  }

  getOrderMovements(order: ServiceOrder): DeviceMovement[] {
    return this.chronological(this.deviceMovements.filter(m => m.service_order_id === order.id));
  }

  // Mais antigo primeiro; no mesmo instante, respeita a ordem em que foram registrados
  // (a lista guarda o mais recente na frente, então o índice maior é o mais antigo)
  private chronological(list: DeviceMovement[]): DeviceMovement[] {
    return list
      .map((m, i) => ({ m, i }))
      .sort((a, b) => a.m.created_at.localeCompare(b.m.created_at) || b.i - a.i)
      .map(x => x.m);
  }

  private buildPurchasesFromStock(): SupplierPurchase[] {
    const purchases: SupplierPurchase[] = [];
    this.devices.forEach(d => {
      if (!d.supplier_id) return;
      purchases.push({
        id: 'pur-device-' + d.id,
        tenant_id: d.tenant_id,
        supplier_id: d.supplier_id,
        item_type: 'device',
        item_id: d.id,
        description: `${d.brand} ${d.model} ${d.storage_capacity} - ${d.color} (IMEI ${d.imei})`,
        quantity: 1,
        unit_cost: Number(d.acquisition_cost),
        total_cost: Number(d.acquisition_cost),
        purchased_at: d.entry_date,
        created_at: d.created_at
      });
    });
    const stockItems: { type: 'accessory' | 'gift'; item: Accessory | Gift }[] = [
      ...this.accessories.map(item => ({ type: 'accessory' as const, item })),
      ...this.gifts.map(item => ({ type: 'gift' as const, item }))
    ];
    stockItems.forEach(({ type, item }) => {
      if (!item.supplier_id) return;
      purchases.push({
        id: `pur-${type}-${item.id}`,
        tenant_id: item.tenant_id,
        supplier_id: item.supplier_id,
        item_type: type,
        item_id: item.id,
        description: item.name,
        quantity: item.quantity,
        unit_cost: Number(item.unit_cost),
        total_cost: Number(item.unit_cost) * item.quantity,
        purchased_at: item.created_at,
        created_at: item.created_at
      });
    });
    return purchases;
  }

  saveToStorage() {
    try {
      const data = {
        tenants: this.tenants,
        themes: this.themes,
        profiles: this.profiles,
        customers: this.customers,
        suppliers: this.suppliers,
        supplierPurchases: this.supplierPurchases,
        devices: this.devices,
        accessories: this.accessories,
        gifts: this.gifts,
        sales: this.sales,
        tradeIns: this.tradeIns,
        serviceOrders: this.serviceOrders,
        internalRepairs: this.internalRepairs,
        expenses: this.expenses,
        goals: this.goals,
        auditLogs: this.auditLogs,
        supportSessions: this.supportSessions,
        deviceMovements: this.deviceMovements,
        tenantSettings: this.tenantSettings,
        warranties: this.warranties,
        returnRequests: this.returnRequests,
        customerCredits: this.customerCredits,
        tenantDocuments: this.tenantDocuments,
        unsynced: this.unsynced
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      this.saveFailed = false;
    } catch (e) {
      console.error('Erro ao salvar no storage:', e);
      this.saveFailed = true;
    }
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // --- MÉTODOS TRANSACIONAIS ---

  addAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>) {
    const newLog: AuditLog = {
      ...log,
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      created_at: new Date().toISOString()
    };
    this.auditLogs.unshift(newLog);
    this.saveToStorage();
  }

  // --- FORNECEDORES ---

  getSupplierName(supplierId?: string): string {
    const supplier = supplierId ? this.suppliers.find(s => s.id === supplierId) : undefined;
    return supplier ? supplier.name : 'Não informado';
  }

  recordSupplierPurchase(purchase: Omit<SupplierPurchase, 'id' | 'created_at' | 'total_cost'>) {
    this.supplierPurchases.unshift({
      ...purchase,
      total_cost: purchase.unit_cost * purchase.quantity,
      id: 'pur-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      created_at: new Date().toISOString()
    });
  }

  // Aparelho tem compra única: recria o registro quando fornecedor, custo ou dados mudam
  syncDevicePurchase(device: Device) {
    this.supplierPurchases = this.supplierPurchases.filter(
      p => !(p.item_type === 'device' && p.item_id === device.id)
    );
    if (!device.supplier_id) return;
    this.recordSupplierPurchase({
      tenant_id: device.tenant_id,
      supplier_id: device.supplier_id,
      item_type: 'device',
      item_id: device.id,
      description: `${device.brand} ${device.model} ${device.storage_capacity} - ${device.color} (IMEI ${device.imei})`,
      quantity: 1,
      unit_cost: Number(device.acquisition_cost),
      purchased_at: device.entry_date
    });
  }

  // --------------------------------------------------------------------------
  // CLIENTES E FORNECEDORES — gravados no banco (modo real) com cópia local
  // --------------------------------------------------------------------------

  private markUnsynced(kind: 'customers' | 'suppliers', id: string) {
    if (!this.isRealMode) return; // na demonstração nada vai para o servidor
    if (!this.unsynced[kind].includes(id)) this.unsynced[kind].push(id);
  }

  /** Envia ao servidor o que ainda está na fila. Chamado após cada cadastro e a cada sincronização. */
  async pushUnsynced(): Promise<boolean> {
    if (!this.isRealMode || !this.hasUnsynced) return true;
    const customerIds = [...this.unsynced.customers];
    const supplierIds = [...this.unsynced.suppliers];
    const [customersOk, suppliersOk] = await Promise.all([
      pushCustomers(this.customers.filter(c => customerIds.includes(c.id) && isUuid(c.id))),
      pushSuppliers(this.suppliers.filter(s => supplierIds.includes(s.id) && isUuid(s.id)))
    ]);
    if (customersOk) this.unsynced.customers = this.unsynced.customers.filter(id => !customerIds.includes(id));
    if (suppliersOk) this.unsynced.suppliers = this.unsynced.suppliers.filter(id => !supplierIds.includes(id));
    this.saveToStorage();
    return customersOk && suppliersOk;
  }

  /**
   * Cadastra ou edita um cliente. `defer` adia o envio ao servidor (usado quando o cliente nasce
   * junto de outra operação que ainda pode ser recusada; depois chame pushUnsynced ou discardCustomer).
   */
  saveCustomer(p: {
    tenantId: string; userId: string; customerId?: string; data: CustomerInput; origin?: string; defer?: boolean;
  }): OpResult<Customer> {
    const name = p.data.name?.trim();
    const phone = p.data.phone?.trim();
    if (!name || !phone) return opFail('Informe nome e telefone do cliente.');
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
    const fields = {
      name, phone,
      whatsapp: clean(p.data.whatsapp) || phone,
      email: clean(p.data.email),
      cpf: clean(p.data.cpf),
      birth_date: clean(p.data.birth_date),
      address: clean(p.data.address),
      notes: clean(p.data.notes)
    };

    const existing = p.customerId
      ? this.customers.find(c => c.id === p.customerId && c.tenant_id === p.tenantId)
      : undefined;
    if (p.customerId && !existing) return opFail('Cliente não encontrado.');

    const customer: Customer = existing || { id: newUuid(), tenant_id: p.tenantId, name, phone, created_at: new Date().toISOString() };
    Object.assign(customer, fields);
    if (!existing) this.customers.unshift(customer);
    this.markUnsynced('customers', customer.id);

    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: this.roleOf(p.userId),
      action: existing ? 'CLIENTE_EDITADO' : 'CLIENTE_CADASTRADO', module: 'Clientes', record_id: customer.id,
      details: { nome: name, telefone: phone, origem: p.origin }
    });
    this.saveToStorage();
    if (!p.defer) void this.pushUnsynced();
    return { ok: true, data: customer };
  }

  /** Desfaz um cliente criado com `defer` cuja operação principal foi recusada. */
  discardCustomer(customerId: string) {
    this.customers = this.customers.filter(c => c.id !== customerId);
    this.unsynced.customers = this.unsynced.customers.filter(id => id !== customerId);
    this.saveToStorage();
  }

  saveSupplier(p: { tenantId: string; userId: string; supplierId?: string; data: SupplierInput }): OpResult<Supplier> {
    if (!this.isManager(this.roleOf(p.userId))) return opFail('Somente administradores podem cadastrar ou alterar fornecedores.');
    const name = p.data.name?.trim();
    const phone = p.data.phone?.trim();
    if (!name || !phone) return opFail('Informe nome e telefone do fornecedor.');
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
    const fields = {
      name, phone,
      company_name: clean(p.data.company_name),
      whatsapp: clean(p.data.whatsapp),
      email: clean(p.data.email),
      cpf_cnpj: clean(p.data.cpf_cnpj),
      address: clean(p.data.address),
      notes: clean(p.data.notes)
    };

    const existing = p.supplierId
      ? this.suppliers.find(s => s.id === p.supplierId && s.tenant_id === p.tenantId)
      : undefined;
    if (p.supplierId && !existing) return opFail('Fornecedor não encontrado.');

    const supplier: Supplier = existing || { id: newUuid(), tenant_id: p.tenantId, name, phone, created_at: new Date().toISOString() };
    Object.assign(supplier, fields);
    if (!existing) this.suppliers.unshift(supplier);
    this.markUnsynced('suppliers', supplier.id);

    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: this.roleOf(p.userId),
      action: existing ? 'FORNECEDOR_EDITADO' : 'FORNECEDOR_CADASTRADO', module: 'Fornecedores', record_id: supplier.id,
      details: { nome: name, empresa: fields.company_name, telefone: phone }
    });
    this.saveToStorage();
    void this.pushUnsynced();
    return { ok: true, data: supplier };
  }

  /**
   * Recebe do servidor a lista atual de uma loja. Registros locais que ainda não foram enviados
   * (fila de envio) são preservados; os demais passam a refletir exatamente o que está no banco.
   */
  applyRemoteRecords(tenantId: string, remote: { customers?: Customer[]; suppliers?: Supplier[] }) {
    if (remote.customers) {
      const ids = new Set(remote.customers.map(c => c.id));
      const pending = this.customers.filter(c => c.tenant_id === tenantId && !ids.has(c.id) && this.unsynced.customers.includes(c.id));
      this.customers = [...pending, ...remote.customers, ...this.customers.filter(c => c.tenant_id !== tenantId)];
    }
    if (remote.suppliers) {
      const ids = new Set(remote.suppliers.map(s => s.id));
      const pending = this.suppliers.filter(s => s.tenant_id === tenantId && !ids.has(s.id) && this.unsynced.suppliers.includes(s.id));
      this.suppliers = [...pending, ...remote.suppliers, ...this.suppliers.filter(s => s.tenant_id !== tenantId)];
    }
    this.saveToStorage();
  }

  /**
   * Cadastros feitos antes da ligação com o banco têm identificador antigo. Cada um recebe um
   * identificador novo, as referências (vendas, OS, garantias, estoque...) são ajustadas e ele entra na fila de envio.
   */
  adoptLegacyRecords(tenantId: string, kinds: { customers: boolean; suppliers: boolean }): number {
    let adopted = 0;
    if (kinds.customers) {
      this.customers.filter(c => c.tenant_id === tenantId && !isUuid(c.id)).forEach(c => {
        const oldId = c.id;
        c.id = newUuid();
        [this.sales, this.tradeIns, this.serviceOrders, this.warranties, this.returnRequests, this.customerCredits]
          .forEach(list => (list as { customer_id?: string }[]).forEach(row => {
            if (row.customer_id === oldId) row.customer_id = c.id;
          }));
        this.markUnsynced('customers', c.id);
        adopted++;
      });
    }
    if (kinds.suppliers) {
      this.suppliers.filter(s => s.tenant_id === tenantId && !isUuid(s.id)).forEach(s => {
        const oldId = s.id;
        s.id = newUuid();
        [this.devices, this.accessories, this.gifts, this.supplierPurchases]
          .forEach(list => (list as { supplier_id?: string }[]).forEach(row => {
            if (row.supplier_id === oldId) row.supplier_id = s.id;
          }));
        this.markUnsynced('suppliers', s.id);
        adopted++;
      });
    }
    if (adopted > 0) this.saveToStorage();
    return adopted;
  }

  // Exclui o fornecedor, desvincula os itens do estoque e remove o histórico de compras dele
  deleteSupplier(supplierId: string) {
    this.unsynced.suppliers = this.unsynced.suppliers.filter(id => id !== supplierId);
    if (this.isRealMode && isUuid(supplierId)) void removeSupplierRemote(supplierId);
    this.suppliers = this.suppliers.filter(s => s.id !== supplierId);
    this.supplierPurchases = this.supplierPurchases.filter(p => p.supplier_id !== supplierId);
    [...this.devices, ...this.accessories, ...this.gifts].forEach(item => {
      if (item.supplier_id === supplierId) item.supplier_id = undefined;
    });
  }

  // Finalização Atômica de Venda
  finalizeSale(payload: {
    tenantId: string;
    sellerId: string;
    customerId: string;
    salesOrigin: string;
    subtotal: number;
    discountAmount: number;
    totalAmount: number;
    totalCost: number;
    items: {
      itemType: 'device' | 'accessory';
      deviceId?: string;
      accessoryId?: string;
      quantity: number;
      unitCost: number;
      unitPrice: number;
      discount: number;
      totalPrice: number;
    }[];
    payments: {
      paymentMethod: PaymentMethod;
      amount: number;
      installments: number;
    }[];
    gifts: {
      giftId: string;
      quantity: number;
      unitCost: number;
    }[];
  }): Sale {
    // Validação ANTES de qualquer baixa: o aparelho precisa estar disponível e não pode repetir no pedido
    const seenDevices = new Set<string>();
    payload.items.forEach(it => {
      if (it.itemType !== 'device' || !it.deviceId) return;
      const dev = this.devices.find(d => d.id === it.deviceId && d.tenant_id === payload.tenantId);
      if (!dev) throw new Error('Aparelho não encontrado no estoque desta loja.');
      if (dev.status !== 'available') {
        throw new Error(`O aparelho ${dev.brand} ${dev.model} (IMEI ${dev.imei}) não está disponível para venda.`);
      }
      if (seenDevices.has(dev.id)) throw new Error('O mesmo aparelho não pode ser vendido duas vezes no mesmo pedido.');
      seenDevices.add(dev.id);
    });

    if (payload.items.length === 0) throw new Error('Adicione pelo menos um aparelho ou acessório à venda.');
    if (!this.customers.some(c => c.id === payload.customerId && c.tenant_id === payload.tenantId)) {
      throw new Error('Selecione o cliente da venda.');
    }
    if (!payload.salesOrigin.trim()) throw new Error('Informe como o cliente conheceu a loja.');
    const sellerProfile = this.profiles.find(p => p.id === payload.sellerId);
    if (!sellerProfile || (sellerProfile.role !== 'super_admin' && sellerProfile.tenant_id !== payload.tenantId)) {
      throw new Error('O usuário não pertence a esta loja.');
    }

    // Valores: preço positivo, desconto entre zero e o preço, quantidade inteira
    payload.items.forEach(it => {
      if (!Number.isInteger(it.quantity) || it.quantity < 1) throw new Error('A quantidade de cada item deve ser de pelo menos 1.');
      if (it.itemType === 'device' && it.quantity !== 1) throw new Error('Cada aparelho é vendido individualmente (quantidade 1).');
      if (!(toCents(it.unitPrice) > 0)) throw new Error('O preço de cada item deve ser maior que zero.');
      if (toCents(it.discount) < 0 || toCents(it.discount) >= toCents(it.unitPrice)) {
        throw new Error('O desconto não pode ser negativo nem igual ou maior que o preço do item.');
      }
    });

    // Saldo de acessórios e brindes (somando linhas repetidas do mesmo item)
    const accessoryQty = new Map<string, number>();
    payload.items.forEach(it => {
      if (it.itemType !== 'accessory') return;
      if (!it.accessoryId) throw new Error('Acessório não informado.');
      accessoryQty.set(it.accessoryId, (accessoryQty.get(it.accessoryId) || 0) + it.quantity);
    });
    accessoryQty.forEach((qty, id) => {
      const acc = this.accessories.find(a => a.id === id && a.tenant_id === payload.tenantId);
      if (!acc) throw new Error('Acessório não encontrado no estoque desta loja.');
      if (qty > acc.quantity) throw new Error(`Estoque insuficiente de "${acc.name}": há ${acc.quantity} un. e o pedido tem ${qty}.`);
    });
    const giftQty = new Map<string, number>();
    payload.gifts.forEach(g => {
      if (!Number.isInteger(g.quantity) || g.quantity < 1) throw new Error('A quantidade de cada brinde deve ser de pelo menos 1.');
      giftQty.set(g.giftId, (giftQty.get(g.giftId) || 0) + g.quantity);
    });
    giftQty.forEach((qty, id) => {
      const gift = this.gifts.find(g => g.id === id && g.tenant_id === payload.tenantId);
      if (!gift) throw new Error('Brinde não encontrado no estoque desta loja.');
      if (qty > gift.quantity) throw new Error(`Estoque insuficiente do brinde "${gift.name}": há ${gift.quantity} un. e o pedido tem ${qty}.`);
    });

    // Totais e custos são calculados aqui, a partir dos itens e do estoque (os valores enviados pela tela não são usados)
    const itemCost = (it: (typeof payload.items)[number]) => {
      if (it.itemType === 'device') {
        const d = this.devices.find(x => x.id === it.deviceId)!;
        return Number(d.acquisition_cost) + Number(d.accumulated_repair_cost);
      }
      return Number(this.accessories.find(a => a.id === it.accessoryId)!.unit_cost);
    };
    const items = payload.items.map(it => ({
      ...it,
      unitCost: itemCost(it),
      totalPrice: ((toCents(it.unitPrice) - toCents(it.discount)) * it.quantity) / 100
    }));
    const gifts = payload.gifts.map(g => ({ ...g, unitCost: Number(this.gifts.find(x => x.id === g.giftId)!.unit_cost) }));
    const subtotalCents = items.reduce((acc, it) => acc + toCents(it.unitPrice) * it.quantity, 0);
    const discountCents = items.reduce((acc, it) => acc + toCents(it.discount) * it.quantity, 0);
    const totalCents = subtotalCents - discountCents;
    const costCents =
      items.reduce((acc, it) => acc + toCents(it.unitCost) * it.quantity, 0) +
      gifts.reduce((acc, g) => acc + toCents(g.unitCost) * g.quantity, 0);
    payload = {
      ...payload, items, gifts,
      subtotal: subtotalCents / 100, discountAmount: discountCents / 100, totalAmount: totalCents / 100, totalCost: costCents / 100
    };

    // Pagamentos: valores positivos que fecham exatamente o total da venda
    if (payload.payments.length === 0) throw new Error('Informe a forma de pagamento.');
    if (payload.payments.some(p => !(toCents(p.amount) > 0))) throw new Error('Cada pagamento deve ter valor maior que zero.');
    const paidCents = payload.payments.reduce((acc, p) => acc + toCents(p.amount), 0);
    if (paidCents !== totalCents) {
      throw new Error(`Os pagamentos somam R$ ${(paidCents / 100).toFixed(2)}, mas o total da venda é R$ ${(totalCents / 100).toFixed(2)}.`);
    }

    // Crédito do cliente: nunca acima do saldo nem do total da venda
    const creditUseCents = payload.payments
      .filter(p => p.paymentMethod === 'store_credit')
      .reduce((acc, p) => acc + toCents(p.amount), 0);
    if (creditUseCents > 0) {
      if (creditUseCents > toCents(this.getCustomerCreditBalance(payload.tenantId, payload.customerId))) {
        throw new Error('O crédito informado é maior que o saldo disponível do cliente.');
      }
      if (creditUseCents > toCents(payload.totalAmount)) {
        throw new Error('O crédito utilizado não pode ser maior que o total da venda.');
      }
    }

    const saleId = uid('sale-');
    const saleNumber = Math.max(1000, ...this.sales.map(s => s.sale_number)) + 1;
    const now = new Date().toISOString();

    // 1. Processar itens e baixar estoque
    const processedItems = payload.items.map((it, idx) => {
      if (it.itemType === 'device' && it.deviceId) {
        const device = this.devices.find(d => d.id === it.deviceId && d.tenant_id === payload.tenantId);
        if (device) {
          device.status = 'sold';
          device.sold_at = now;
          this.recordMovement({
            tenant_id: payload.tenantId, device_id: device.id, imei: device.imei,
            movement_type: 'sold', description: `Aparelho vendido (venda #${saleNumber})`,
            from_status: 'available', to_status: 'sold', cost: Number(it.unitPrice), user_id: payload.sellerId
          });
        }
      } else if (it.itemType === 'accessory' && it.accessoryId) {
        const acc = this.accessories.find(a => a.id === it.accessoryId && a.tenant_id === payload.tenantId);
        if (acc) {
          acc.quantity -= it.quantity;
        }
      }
      return {
        id: `sitem-${saleId}-${idx}`,
        sale_id: saleId,
        item_type: it.itemType,
        device_id: it.deviceId,
        accessory_id: it.accessoryId,
        quantity: it.quantity,
        unit_cost: it.unitCost,
        unit_price: it.unitPrice,
        discount: it.discount,
        total_price: it.totalPrice,
        warranty_days: it.itemType === 'device' ? WARRANTY_DAYS : undefined
      };
    });

    // 2. Processar brindes (cobrado R$ 0,00, dá baixa de estoque)
    const processedGifts = payload.gifts.map((g, idx) => {
      const giftItem = this.gifts.find(gf => gf.id === g.giftId && gf.tenant_id === payload.tenantId);
      if (giftItem) {
        giftItem.quantity -= g.quantity;
      }
      return {
        id: `sgift-${saleId}-${idx}`,
        sale_id: saleId,
        gift_id: g.giftId,
        quantity: g.quantity,
        unit_cost: g.unitCost
      };
    });

    // 3. Processar pagamentos
    const processedPayments = payload.payments.map((p, idx) => ({
      id: `spay-${saleId}-${idx}`,
      sale_id: saleId,
      payment_method: p.paymentMethod,
      amount: p.amount,
      installments: p.installments,
      received_at: now
    }));

    const grossProfit = payload.totalAmount - payload.totalCost;

    const newSale: Sale = {
      id: saleId,
      tenant_id: payload.tenantId,
      sale_number: saleNumber,
      seller_id: payload.sellerId,
      customer_id: payload.customerId,
      sales_origin: payload.salesOrigin,
      subtotal: payload.subtotal,
      discount_amount: payload.discountAmount,
      total_amount: payload.totalAmount,
      total_cost: payload.totalCost,
      gross_profit: grossProfit,
      status: 'completed',
      created_at: now,
      items: processedItems,
      payments: processedPayments,
      gifts: processedGifts
    };

    this.sales.unshift(newSale);

    // Uma garantia individual por aparelho vendido (prazo registrado no momento da venda)
    processedItems.forEach(item => this.ensureWarrantyForItem(newSale, item, payload.sellerId));
    if (creditUseCents > 0) this.consumeCustomerCredit(payload.tenantId, payload.customerId, creditUseCents, saleId);

    // Auditoria
    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.sellerId,
      user_role: this.roleOf(payload.sellerId),
      action: 'VENDA_FINALIZADA',
      module: 'Vendas',
      record_id: saleId,
      details: {
        numero: saleNumber,
        origem: payload.salesOrigin,
        total: payload.totalAmount,
        itens_qtd: payload.items.length
      }
    });

    this.saveToStorage();
    return newSale;
  }

  // Cancelamento de Venda com Reversão de Estoque
  cancelSale(saleId: string, tenantId: string, userId: string, reason: string): OpResult {
    const sale = this.sales.find(s => s.id === saleId && s.tenant_id === tenantId);
    if (!sale) return opFail('Venda não encontrada.');
    if (sale.status === 'cancelled') return opFail('Esta venda já foi cancelada.');
    if (!reason.trim()) return opFail('Informe o motivo do cancelamento.');
    if (!this.isManager(this.roleOf(userId))) return opFail('Somente administradores podem cancelar vendas.');
    if ((sale.items || []).some(it => it.returned_at)) {
      return opFail('Esta venda já teve troca ou devolução concluída (com reembolso, crédito ou aparelho substituto) e não pode mais ser cancelada.');
    }

    // Upgrade: o aparelho recebido só pode ser invalidado enquanto estiver parado no estoque
    const tradeIn = sale.trade_in_id ? this.tradeIns.find(t => t.id === sale.trade_in_id) : undefined;
    const received = tradeIn ? this.devices.find(d => d.id === tradeIn.received_device_id) : undefined;
    if (tradeIn && received && received.status !== 'available') {
      const reasons: Record<string, string> = {
        sold: 'já foi vendido',
        in_maintenance: 'está em manutenção',
        awaiting_evaluation: 'está aguardando avaliação',
        reserved: 'está reservado',
        decommissioned: 'foi baixado'
      };
      return opFail(
        `Não é possível cancelar o upgrade: o aparelho recebido (IMEI ${received.imei}) ${reasons[received.status] || 'não está disponível no estoque'}.`
      );
    }

    // Reverter estoque (itens já trocados/devolvidos seguem o próprio fluxo e não são tocados)
    sale.items?.forEach(it => {
      if (it.returned_at) return;
      if (it.item_type === 'device' && it.device_id) {
        const device = this.devices.find(d => d.id === it.device_id && d.tenant_id === tenantId);
        if (device && device.status === 'sold') {
          device.status = 'available';
          device.sold_at = undefined;
          this.recordMovement({
            tenant_id: tenantId, device_id: device.id, imei: device.imei,
            movement_type: 'sale_cancelled', description: `Venda #${sale.sale_number} cancelada: aparelho devolvido ao estoque`,
            from_status: 'sold', to_status: 'available', notes: reason, user_id: userId
          });
        }
      } else if (it.item_type === 'accessory' && it.accessory_id) {
        const acc = this.accessories.find(a => a.id === it.accessory_id && a.tenant_id === tenantId);
        if (acc) acc.quantity += it.quantity;
      }
    });

    // Upgrade: invalida a entrada do aparelho recebido (registro e IMEI preservados para rastreio)
    if (tradeIn && received) {
      const previous = tradeIn.received_device_snapshot;
      if (previous) {
        // O aparelho já tinha cadastro (vendido antes pela loja): volta exatamente ao que era
        Object.keys(received).forEach(k => delete (received as unknown as Record<string, unknown>)[k]);
        Object.assign(received, previous);
        // e a garantia que ele tinha com o cliente volta a valer, com as mesmas datas
        this.warranties.filter(w => tradeIn.closed_warranty_ids?.includes(w.id)).forEach(w => {
          w.status = 'active';
          w.cancelled_at = undefined;
          w.cancel_reason = undefined;
          w.history.push(this.event(`Garantia restabelecida: upgrade da venda #${sale.sale_number} cancelado`, userId));
        });
      } else {
        received.status = 'decommissioned';
      }
      this.recordMovement({
        tenant_id: tenantId, device_id: received.id, imei: received.imei,
        movement_type: 'sale_cancelled',
        description: `Entrada invalidada: upgrade da venda #${sale.sale_number} cancelado (aparelho devolvido ao cliente)`,
        from_status: 'available', to_status: received.status, notes: reason, user_id: userId
      });
      tradeIn.status = 'cancelled';
    }

    // Reverter brindes
    sale.gifts?.forEach(g => {
      const giftItem = this.gifts.find(gf => gf.id === g.gift_id && gf.tenant_id === tenantId);
      if (giftItem) giftItem.quantity += g.quantity;
    });

    // Crédito do cliente usado nesta venda volta ao saldo
    this.customerCredits.forEach(credit => {
      if (credit.tenant_id !== tenantId) return;
      const used = credit.usages.filter(u => u.sale_id === sale.id);
      if (used.length === 0) return;
      const back = used.reduce((acc, u) => acc + toCents(u.amount), 0);
      credit.balance = Math.min(toCents(credit.amount), toCents(credit.balance) + back) / 100;
      credit.usages = credit.usages.filter(u => u.sale_id !== sale.id);
    });

    this.warranties
      .filter(w => w.sale_id === sale.id && w.status === 'active')
      .forEach(w => this.cancelWarranty(w, 'Venda cancelada: ' + reason, userId));

    // Solicitações de troca/devolução ainda em andamento deixam de fazer sentido
    this.returnRequests
      .filter(r => r.sale_id === sale.id && ['open', 'in_review', 'approved'].includes(r.status))
      .forEach(r => {
        r.status = 'cancelled';
        r.history.push(this.event('Status: Cancelada', userId, `Venda #${sale.sale_number} cancelada: ${reason}`));
      });

    // A venda deixa de contar em receita, lucro, ranking e indicadores (todos usam status = concluída)
    sale.status = 'cancelled';
    sale.cancellation_reason = reason;
    sale.cancelled_by = userId;
    sale.cancelled_at = new Date().toISOString();

    this.addAuditLog({
      tenant_id: tenantId,
      user_id: userId,
      user_role: this.roleOf(userId),
      action: 'VENDA_CANCELADA',
      module: 'Vendas',
      record_id: saleId,
      details: {
        motivo: reason,
        numero: sale.sale_number,
        tipo: tradeIn ? 'upgrade' : 'venda',
        aparelho_recebido_invalidado: received?.imei,
        valor_estornado: sale.total_amount
      }
    });

    this.saveToStorage();
    return { ok: true };
  }

  // Processamento Atômico de Upgrade (Trade-in)
  processTradeIn(payload: {
    tenantId: string;
    customerId: string;
    sellerId: string;
    soldDeviceId: string;
    soldDevicePrice: number;
    receivedImei: string;
    receivedBrand: string;
    receivedModel: string;
    receivedStorage: string;
    receivedColor: string;
    receivedBatteryHealth?: number;
    receivedNotes?: string;
    appraisalValue: number;
    paymentMethod: PaymentMethod;
    installments?: number;
    salesOrigin?: string;
  }): TradeIn {
    const soldCheck = this.devices.find(d => d.id === payload.soldDeviceId && d.tenant_id === payload.tenantId);
    if (!soldCheck || soldCheck.status !== 'available') {
      throw new Error('O aparelho do upgrade não está disponível para venda.');
    }
    if (!this.customers.some(c => c.id === payload.customerId && c.tenant_id === payload.tenantId)) {
      throw new Error('Selecione o cliente do upgrade.');
    }
    const receivedImei = normalizeImei(payload.receivedImei);
    if (!isValidImei(receivedImei)) throw new Error(`IMEI do aparelho recebido inválido. ${IMEI_HINT}`);
    // Aparelho que a loja já vendeu (ou cuja entrada foi invalidada) pode voltar: o mesmo cadastro é reaproveitado
    const known = this.findDeviceByImei(payload.tenantId, receivedImei);
    if (known && known.id === soldCheck.id) throw new Error('O aparelho recebido não pode ser o mesmo que está sendo vendido.');
    if (known && known.status !== 'sold' && known.status !== 'decommissioned') {
      throw new Error('Já existe um aparelho com este IMEI no estoque da loja.');
    }
    if (!(payload.soldDevicePrice > 0) || !(payload.appraisalValue >= 0)) {
      throw new Error('Informe valores válidos para o aparelho vendido e para a avaliação.');
    }
    if (toCents(payload.appraisalValue) > toCents(payload.soldDevicePrice)) {
      throw new Error('A avaliação do aparelho usado não pode ser maior que o preço do aparelho vendido: a diferença a favor do cliente não teria como ser registrada.');
    }

    const now = new Date().toISOString();
    const tradeInId = uid('trade-');
    const receivedDeviceId = known ? known.id : uid('dev-up-');
    const receivedSnapshot = known ? { ...known } : undefined;
    const saleId = uid('sale-');
    const saleNumber = Math.max(1000, ...this.sales.map(s => s.sale_number)) + 1;
    const soldDev = soldCheck;
    const soldCost = Number(soldDev.acquisition_cost) + Number(soldDev.accumulated_repair_cost);

    // 1. Baixa do aparelho vendido
    soldDev.status = 'sold';
    soldDev.sold_at = now;
    this.recordMovement({
      tenant_id: payload.tenantId, device_id: soldDev.id, imei: soldDev.imei,
      movement_type: 'sold', description: `Aparelho vendido em upgrade (venda #${saleNumber})`,
      from_status: 'available', to_status: 'sold', cost: payload.soldDevicePrice, user_id: payload.sellerId
    });

    // 2. Entrada automática do aparelho recebido (origem 'trade_in', custo = avaliação)
    const receivedData: Device = {
      id: receivedDeviceId,
      tenant_id: payload.tenantId,
      imei: receivedImei,
      brand: payload.receivedBrand,
      model: payload.receivedModel,
      storage_capacity: payload.receivedStorage,
      color: payload.receivedColor,
      battery_health: payload.receivedBatteryHealth,
      physical_condition_notes: payload.receivedNotes,
      origin: 'trade_in',
      origin_trade_in_id: tradeInId,
      acquisition_cost: payload.appraisalValue,
      accumulated_repair_cost: 0.0,
      suggested_price: Math.round(payload.appraisalValue * 1.35),
      status: 'available',
      entry_date: now,
      created_at: known ? known.created_at : now
    };
    let receivedDevice: Device;
    let closedWarrantyIds: string[] = [];
    if (known) {
      closedWarrantyIds = this.closeWarrantiesForDevice(known.id, `Aparelho voltou para a loja em upgrade (venda #${saleNumber})`, payload.sellerId);
      known.supplier_id = undefined;
      known.sold_at = undefined;
      Object.assign(known, receivedData);
      receivedDevice = known;
    } else {
      receivedDevice = receivedData;
      this.devices.unshift(receivedDevice);
    }
    this.recordMovement({
      tenant_id: payload.tenantId, device_id: receivedDevice.id, imei: receivedDevice.imei,
      movement_type: 'stock_entry',
      description: known
        ? `Aparelho já vendido pela loja voltou em upgrade (venda #${saleNumber}) e reentrou no estoque`
        : `Aparelho recebido em upgrade (venda #${saleNumber}) e cadastrado no estoque`,
      to_status: 'available', cost: payload.appraisalValue, user_id: payload.sellerId
    });

    // 3. Venda normal na mesma sequência: aparelho vendido + pagamentos (aparelho usado + diferença)
    const credit = Math.min(payload.appraisalValue, payload.soldDevicePrice);
    const difference = Math.round((payload.soldDevicePrice - credit) * 100) / 100;
    const payments = [
      ...(credit > 0
        ? [{ id: `spay-${saleId}-0`, sale_id: saleId, payment_method: 'trade_in_credit' as PaymentMethod, amount: credit, installments: 1, received_at: now }]
        : []),
      ...(difference > 0
        ? [{
            id: `spay-${saleId}-1`, sale_id: saleId, payment_method: payload.paymentMethod, amount: difference,
            installments: payload.paymentMethod === 'credit_card' ? Math.max(1, Math.floor(payload.installments || 1)) : 1,
            received_at: now
          }]
        : [])
    ];
    const item: SaleItem = {
      id: `sitem-${saleId}-0`,
      sale_id: saleId,
      item_type: 'device',
      device_id: soldDev.id,
      quantity: 1,
      unit_cost: soldCost,
      unit_price: payload.soldDevicePrice,
      discount: 0,
      total_price: payload.soldDevicePrice,
      warranty_days: WARRANTY_DAYS
    };
    const sale: Sale = {
      id: saleId,
      tenant_id: payload.tenantId,
      sale_number: saleNumber,
      seller_id: payload.sellerId,
      customer_id: payload.customerId,
      sales_origin: payload.salesOrigin || 'Não informada',
      subtotal: payload.soldDevicePrice,
      discount_amount: 0,
      total_amount: payload.soldDevicePrice,
      total_cost: soldCost,
      gross_profit: payload.soldDevicePrice - soldCost,
      status: 'completed',
      trade_in_id: tradeInId,
      created_at: now,
      items: [item],
      payments,
      gifts: []
    };
    this.sales.unshift(sale);
    this.ensureWarrantyForItem(sale, item, payload.sellerId);

    const tradeIn: TradeIn = {
      id: tradeInId,
      tenant_id: payload.tenantId,
      customer_id: payload.customerId,
      seller_id: payload.sellerId,
      sold_device_id: payload.soldDeviceId,
      received_device_id: receivedDeviceId,
      appraisal_value: payload.appraisalValue,
      sold_device_price: payload.soldDevicePrice,
      difference_amount: payload.soldDevicePrice - payload.appraisalValue,
      payment_method: payload.paymentMethod,
      sale_id: saleId,
      received_device_snapshot: receivedSnapshot,
      closed_warranty_ids: closedWarrantyIds.length ? closedWarrantyIds : undefined,
      status: 'completed',
      created_at: now
    };
    this.tradeIns.unshift(tradeIn);

    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.sellerId,
      user_role: this.roleOf(payload.sellerId),
      action: 'VENDA_FINALIZADA',
      module: 'Vendas',
      record_id: saleId,
      details: {
        numero: saleNumber,
        tipo: 'upgrade',
        origem: sale.sales_origin,
        total: payload.soldDevicePrice,
        aparelho_vendido: soldDev.model,
        aparelho_recebido: payload.receivedModel,
        avaliacao: payload.appraisalValue,
        diferenca_paga: difference
      }
    });

    this.saveToStorage();
    return tradeIn;
  }

  // Balcão do vendedor: mesma criação validada da assistência externa (IMEI, garantia e rastreio)
  createServiceOrder(payload: {
    tenantId: string;
    customerId: string;
    sellerId: string;
    brand: string;
    model: string;
    imei?: string;
    reportedDefect: string;
    physicalCondition?: string;
    storage?: string;
    color?: string;
    imei2?: string;
    checklist?: Record<string, 'ok' | 'fail' | 'untested'>;
    estimatedDeliveryDate?: string;
  }): AssistanceResult {
    return this.createExternalAssistance({
      tenantId: payload.tenantId,
      customerId: payload.customerId,
      userId: payload.sellerId,
      userRole: this.roleOf(payload.sellerId),
      brand: payload.brand,
      model: payload.model,
      storage: payload.storage,
      color: payload.color,
      imei: payload.imei,
      imei2: payload.imei2,
      defect: payload.reportedDefect,
      notes: payload.physicalCondition,
      checklist: payload.checklist,
      estimatedDeliveryDate: payload.estimatedDeliveryDate
    });
  }

  // Técnico lança diagnóstico e custos técnicos
  updateServiceOrderDiagnosis(payload: {
    tenantId: string;
    osId: string;
    technicianId: string;
    diagnosis: string;
    partsCost: number;
    serviceCost: number;
    estimatedDeliveryDate?: string;
    problemFound?: string;
    serviceNeeded?: string;
    technicalNotes?: string;
  }): boolean {
    const os = this.serviceOrders.find(o => o.id === payload.osId && o.tenant_id === payload.tenantId);
    if (!os || os.closed_at || os.origin !== 'external') return false;
    // Diagnóstico só enquanto o orçamento ainda não foi apresentado ao cliente
    if (!['waiting_diagnosis', 'in_diagnosis', 'quote_pending_admin'].includes(os.status)) return false;

    os.assigned_technician_id = payload.technicianId;
    os.technician_diagnosis = payload.diagnosis;
    os.problem_found = payload.problemFound?.trim() || undefined;
    os.service_needed = payload.serviceNeeded?.trim() || undefined;
    os.technical_notes = payload.technicalNotes?.trim() || undefined;
    os.technician_parts_cost = payload.partsCost;
    os.technician_service_cost = payload.serviceCost;
    os.estimated_delivery_date = payload.estimatedDeliveryDate || os.estimated_delivery_date;
    const previousStatus = os.status;
    os.status = 'quote_pending_admin'; // Encaminha para o Admin aprovar o valor de cobrança
    this.orderMovement(os, 'assistance_started', `Diagnóstico técnico registrado (OS #${os.os_number})`, {
      userId: payload.technicianId, from: previousStatus, to: 'quote_pending_admin',
      cost: payload.partsCost + payload.serviceCost, notes: payload.diagnosis
    });

    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.technicianId,
      user_role: 'technician',
      action: 'DIAGNOSTICO_REGISTRADO',
      module: 'Assistência Técnica',
      record_id: payload.osId,
      details: { os_numero: os.os_number, custo_tecnico: payload.partsCost + payload.serviceCost }
    });

    this.saveToStorage();
    return true;
  }

  // Administrador define orçamento cobrado do cliente (EXCLUSIVO ADMIN)
  adminSetServiceOrderQuote(payload: {
    tenantId: string;
    osId: string;
    adminId: string;
    clientQuoteAmount: number;
    serviceDescription?: string;
    serviceAmount?: number;
    partsDescription?: string;
    partsAmount?: number;
    deadline?: string;
  }): boolean {
    const os = this.serviceOrders.find(o => o.id === payload.osId && o.tenant_id === payload.tenantId);
    if (!os || os.closed_at || os.origin !== 'external') return false;
    if (os.status !== 'quote_pending_admin' && os.status !== 'quote_ready') return false;
    if (!this.isManager(this.roleOf(payload.adminId))) return false;
    if (!(payload.clientQuoteAmount >= 0)) return false;

    os.client_quote_amount = payload.clientQuoteAmount;
    os.quote_service_description = payload.serviceDescription?.trim() || undefined;
    os.quote_service_amount = payload.serviceAmount;
    os.quote_parts_description = payload.partsDescription?.trim() || undefined;
    os.quote_parts_amount = payload.partsAmount;
    os.quote_deadline = payload.deadline?.trim() || undefined;
    const quoteFrom = os.status;
    os.status = 'quote_ready';
    this.orderMovement(os, 'assistance_started', `Orçamento apresentado ao cliente (OS #${os.os_number})`, {
      userId: payload.adminId, from: quoteFrom, to: 'quote_ready', cost: payload.clientQuoteAmount
    });

    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.adminId,
      user_role: 'admin',
      action: 'ORCAMENTO_DEFINIDO',
      module: 'Assistência Técnica',
      record_id: payload.osId,
      details: { os_numero: os.os_number, valor_cliente: payload.clientQuoteAmount }
    });

    this.saveToStorage();
    return true;
  }

  // Vendedor atualiza aprovação do cliente
  updateClientQuoteApproval(payload: {
    tenantId: string;
    osId: string;
    sellerId: string;
    approved: boolean;
    rejectionReason?: string;
  }): boolean {
    const os = this.serviceOrders.find(o => o.id === payload.osId && o.tenant_id === payload.tenantId);
    if (!os || os.closed_at || os.status !== 'quote_ready') return false;
    if (!payload.approved && !payload.rejectionReason?.trim()) return false;

    if (payload.approved) {
      os.status = 'in_maintenance';
      os.quote_approved_at = new Date().toISOString();
      this.orderMovement(os, 'assistance_started', `Orçamento aprovado pelo cliente: manutenção iniciada (OS #${os.os_number})`, {
        userId: payload.sellerId, from: 'quote_ready', to: 'in_maintenance', cost: Number(os.client_quote_amount) || 0
      });
    } else {
      os.status = 'rejected';
      os.quote_rejected_reason = payload.rejectionReason?.trim();
      this.orderMovement(os, 'assistance_cancelled', `Orçamento recusado pelo cliente (OS #${os.os_number}). Aguardando devolução do aparelho`, {
        userId: payload.sellerId, from: 'quote_ready', to: 'rejected', notes: os.quote_rejected_reason
      });
    }

    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.sellerId,
      user_role: this.roleOf(payload.sellerId),
      action: payload.approved ? 'ORCAMENTO_APROVADO' : 'ORCAMENTO_RECUSADO',
      module: 'Assistência Técnica',
      record_id: payload.osId,
      details: { os_numero: os.os_number, aprovado: payload.approved }
    });

    this.saveToStorage();
    return true;
  }

  // ==========================================================================
  // ASSISTÊNCIA TÉCNICA — A ORIGEM DO APARELHO DETERMINA O DESTINO
  //   INTERNA : aparelho da loja -> manutenção -> volta ao ESTOQUE
  //   EXTERNA : aparelho do cliente -> manutenção -> volta ao CLIENTE (nunca vira estoque)
  // Cada operação valida o estado antes de alterar qualquer dado (tudo ou nada).
  // ==========================================================================

  private findOrder(tenantId: string, osId: string): ServiceOrder | undefined {
    return this.serviceOrders.find(o => o.id === osId && o.tenant_id === tenantId);
  }

  private orderMovement(
    os: ServiceOrder,
    type: MovementType,
    description: string,
    extra: { userId?: string; from?: string; to?: string; cost?: number; notes?: string } = {}
  ) {
    this.recordMovement({
      tenant_id: os.tenant_id,
      device_id: os.device_id,
      service_order_id: os.id,
      imei: os.imei,
      movement_type: type,
      description,
      from_status: extra.from,
      to_status: extra.to,
      cost: extra.cost,
      notes: extra.notes,
      user_id: extra.userId
    });
  }

  // Aparelho do estoque -> Assistência Interna (cria a OS e retira do estoque na mesma operação)
  sendDeviceToAssistance(p: {
    tenantId: string;
    deviceId: string;
    userId: string;
    userRole: string;
    defect: string;
    diagnosis?: string;
    notes?: string;
    enteredAt?: string;
    startMaintenance?: boolean;
  }): AssistanceResult {
    const device = this.devices.find(d => d.id === p.deviceId && d.tenant_id === p.tenantId);
    if (!device) return fail('Aparelho não encontrado.');
    if (device.status !== 'available') {
      return fail('Somente aparelhos disponíveis no estoque podem ser enviados para a assistência.');
    }
    if (this.serviceOrders.some(o => o.origin === 'internal' && o.device_id === device.id && !o.closed_at)) {
      return fail('Já existe uma assistência interna ativa para este aparelho.');
    }
    if (!p.defect.trim()) return fail('Informe o defeito apresentado.');

    const now = new Date().toISOString();
    const entered = p.enteredAt || now;
    const os: ServiceOrder = {
      id: 'os-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tenant_id: p.tenantId,
      os_number: this.nextOsNumber(),
      origin: 'internal',
      device_id: device.id,
      intake_seller_id: p.userId,
      device_brand: device.brand,
      device_model: device.model,
      device_storage: device.storage_capacity,
      device_color: device.color,
      imei: device.imei,
      reported_defect: p.defect.trim(),
      physical_condition: p.notes?.trim() || undefined,
      technician_diagnosis: p.diagnosis?.trim() || undefined,
      status: p.startMaintenance ? 'in_maintenance' : 'waiting_diagnosis',
      technician_parts_cost: 0,
      technician_service_cost: 0,
      entered_at: entered,
      created_at: now
    };

    const repair: InternalRepair = {
      id: 'irep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tenant_id: p.tenantId,
      device_id: device.id,
      technician_id: p.userId,
      issue_description: os.reported_defect,
      repair_cost: 0,
      service_order_id: os.id,
      status: 'in_progress',
      created_at: now
    };

    device.status = 'in_maintenance';
    this.serviceOrders.unshift(os);
    this.internalRepairs.unshift(repair);

    this.orderMovement(os, 'sent_to_assistance', `Enviado para assistência interna (OS #${os.os_number})`, {
      userId: p.userId, from: 'available', to: 'in_maintenance', notes: os.reported_defect
    });
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'ASSISTENCIA_INTERNA_ABERTA', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, imei: device.imei, aparelho: `${device.brand} ${device.model}` }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Aparelho de cliente/terceiro -> Assistência Externa (NÃO cria aparelho no estoque)
  createExternalAssistance(p: {
    tenantId: string;
    customerId: string;
    userId: string;
    userRole: string;
    brand: string;
    model: string;
    storage?: string;
    color?: string;
    imei?: string;
    defect: string;
    diagnosis?: string;
    notes?: string;
    enteredAt?: string;
    imei2?: string;
    checklist?: Record<string, 'ok' | 'fail' | 'untested'>;
    estimatedDeliveryDate?: string;
  }): AssistanceResult {
    if (!this.customers.some(c => c.id === p.customerId && c.tenant_id === p.tenantId)) {
      return fail('Selecione o cliente proprietário do aparelho.');
    }
    if (!p.model.trim() || !p.defect.trim()) return fail('Informe o modelo e o defeito apresentado.');

    const typedImei = p.imei?.trim();
    if (typedImei && !isValidImei(typedImei)) return fail(`IMEI inválido. ${IMEI_HINT}`);
    const imei = normalizeImei(typedImei);
    if (imei) {
      const stockDevice = this.findDeviceByImei(p.tenantId, imei);
      if (stockDevice && stockDevice.status !== 'sold' && stockDevice.status !== 'decommissioned') {
        return fail('Este IMEI pertence a um aparelho do estoque da loja. Use a Assistência Interna.');
      }
      if (this.serviceOrders.some(o => o.tenant_id === p.tenantId && o.origin === 'external' && o.imei === imei && !o.closed_at)) {
        return fail('Já existe uma assistência externa ativa para este IMEI.');
      }
    }

    const now = new Date().toISOString();
    const os: ServiceOrder = {
      id: 'os-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tenant_id: p.tenantId,
      os_number: this.nextOsNumber(),
      origin: 'external',
      customer_id: p.customerId,
      intake_seller_id: p.userId,
      device_brand: p.brand.trim() || 'Apple',
      device_model: p.model.trim(),
      device_storage: p.storage?.trim() || undefined,
      device_color: p.color?.trim() || undefined,
      imei: imei || undefined,
      imei2: p.imei2?.trim() || undefined,
      intake_checklist: p.checklist,
      estimated_delivery_date: p.estimatedDeliveryDate || undefined,
      reported_defect: p.defect.trim(),
      physical_condition: p.notes?.trim() || undefined,
      technician_diagnosis: p.diagnosis?.trim() || undefined,
      status: 'waiting_diagnosis',
      technician_parts_cost: 0,
      technician_service_cost: 0,
      entered_at: p.enteredAt || now,
      created_at: now
    };
    // Garantia comercial localizada pelo IMEI: fica registrada na OS apenas como informação.
    // A cobertura NÃO é aprovada nem negada automaticamente; o resultado da análise é lançado depois.
    const warranty = imei ? this.findWarrantyByImei(p.tenantId, imei) : undefined;
    if (warranty) {
      os.warranty_id = warranty.id;
      os.sale_id = warranty.sale_id;
      os.warranty_analysis = 'pending';
      warranty.history.push(this.event(`Assistência aberta (OS #${os.os_number})`, p.userId, os.reported_defect));
    }

    this.serviceOrders.unshift(os);

    this.orderMovement(os, 'external_received', `Aparelho recebido do cliente (OS #${os.os_number})`, {
      userId: p.userId, to: 'waiting_diagnosis', notes: os.reported_defect
    });
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'ASSISTENCIA_EXTERNA_ABERTA', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, aparelho: `${os.device_brand} ${os.device_model}` }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Aguardando diagnóstico / Em manutenção / Aguardando peça
  updateAssistanceStatus(p: {
    tenantId: string;
    osId: string;
    userId: string;
    newStatus: 'in_maintenance' | 'waiting_parts';
  }): AssistanceResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return fail('Ordem de serviço não encontrada.');
    if (os.closed_at) return fail('Esta ordem de serviço já foi encerrada.');

    const allowed: Record<string, OSStatus[]> = {
      in_maintenance: ['waiting_diagnosis', 'in_diagnosis', 'waiting_parts'],
      waiting_parts: ['in_maintenance']
    };
    if (!allowed[p.newStatus].includes(os.status)) {
      return fail('Esta mudança de status não é permitida na situação atual da ordem de serviço.');
    }

    const from = os.status;
    os.status = p.newStatus;
    if (p.newStatus === 'in_maintenance' && from !== 'waiting_parts') {
      this.orderMovement(os, 'assistance_started', `Manutenção iniciada (OS #${os.os_number})`, { userId: p.userId, from, to: p.newStatus });
    } else if (p.newStatus === 'in_maintenance') {
      this.orderMovement(os, 'assistance_started', `Manutenção retomada após peça (OS #${os.os_number})`, { userId: p.userId, from, to: p.newStatus });
    } else {
      this.orderMovement(os, 'assistance_waiting_parts', `Aguardando peça (OS #${os.os_number})`, { userId: p.userId, from, to: p.newStatus });
    }
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Conclui a assistência INTERNA, soma o custo ao aparelho e o devolve ao estoque disponível
  completeInternalAssistance(p: {
    tenantId: string;
    osId: string;
    userId: string;
    userRole: string;
    serviceDone: string;
    partsUsed: string;
    partsCost: number;
    serviceCost: number;
    notes?: string;
  }): AssistanceResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return fail('Ordem de serviço não encontrada.');
    if (os.origin !== 'internal' || !os.device_id) return fail('Somente assistências internas podem devolver o aparelho ao estoque.');
    if (os.closed_at) return fail('Esta assistência já foi concluída.');
    if (os.status === 'waiting_parts') return fail('O aparelho ainda está aguardando peça e não pode voltar ao estoque.');
    if (os.status !== 'in_maintenance') return fail('Inicie a manutenção antes de concluir a assistência.');
    if (!p.serviceDone.trim()) return fail('Registre o serviço realizado.');
    if (!(p.partsCost >= 0) || !(p.serviceCost >= 0)) return fail('Os custos não podem ser negativos.');

    const device = this.devices.find(d => d.id === os.device_id && d.tenant_id === p.tenantId);
    if (!device) return fail('Aparelho vinculado não encontrado.');
    if (device.status !== 'in_maintenance') return fail('O aparelho não está em manutenção.');

    const now = new Date().toISOString();
    const totalCost = p.partsCost + p.serviceCost;

    device.accumulated_repair_cost = Number(device.accumulated_repair_cost) + totalCost;
    device.status = 'available';

    os.status = 'repair_completed';
    os.technician_parts_cost = p.partsCost;
    os.technician_service_cost = p.serviceCost;
    os.service_performed = p.serviceDone.trim();
    os.parts_used = p.partsUsed.trim() || undefined;
    os.completed_at = now;
    os.closed_at = now;

    const repair = this.internalRepairs.find(r => r.service_order_id === os.id);
    if (repair) {
      repair.status = 'completed';
      repair.diagnosis = os.service_performed;
      repair.parts_used = os.parts_used;
      repair.repair_cost = totalCost;
      repair.completed_at = now;
    }

    this.orderMovement(os, 'assistance_completed', `Manutenção concluída (OS #${os.os_number})`, {
      userId: p.userId, from: 'in_maintenance', to: 'repair_completed', cost: totalCost, notes: p.notes
    });
    this.orderMovement(os, 'returned_to_stock', 'Aparelho retornou ao estoque disponível', {
      userId: p.userId, from: 'in_maintenance', to: 'available', cost: Number(device.accumulated_repair_cost)
    });
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'ASSISTENCIA_INTERNA_CONCLUIDA', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, imei: device.imei, custo_adicionado: totalCost, custo_acumulado_total: device.accumulated_repair_cost }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Conclui a assistência EXTERNA: fica aguardando retirada; nunca entra no estoque
  completeExternalAssistance(p: {
    tenantId: string;
    osId: string;
    userId: string;
    userRole: string;
    serviceDone: string;
    partsUsed: string;
    partsCost: number;
    serviceCost: number;
    chargedAmount: number;
    paymentStatus: 'pending' | 'paid';
    paymentMethod?: PaymentMethod;
  }): AssistanceResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return fail('Ordem de serviço não encontrada.');
    if (os.origin !== 'external') return fail('Esta ação é exclusiva de assistências externas.');
    if (os.closed_at) return fail('Esta assistência já foi encerrada.');
    if (os.status !== 'in_maintenance') return fail('A manutenção precisa estar em andamento para ser concluída.');
    if (!p.serviceDone.trim()) return fail('Registre o serviço realizado.');
    if (!(p.partsCost >= 0) || !(p.serviceCost >= 0) || !(p.chargedAmount >= 0)) {
      return fail('Os valores não podem ser negativos.');
    }
    if (p.paymentStatus === 'paid' && !p.paymentMethod) return fail('Informe a forma de pagamento.');

    const now = new Date().toISOString();
    os.status = 'ready_for_pickup';
    os.technician_parts_cost = p.partsCost;
    os.technician_service_cost = p.serviceCost;
    os.client_quote_amount = p.chargedAmount;
    os.service_performed = p.serviceDone.trim();
    os.parts_used = p.partsUsed.trim() || undefined;
    os.completed_at = now;
    os.payment_status = p.paymentStatus;
    if (p.paymentStatus === 'paid') {
      os.payment_method = p.paymentMethod;
      os.paid_amount = p.chargedAmount;
    }

    this.orderMovement(os, 'external_completed', `Manutenção concluída. Aguardando retirada (OS #${os.os_number})`, {
      userId: p.userId, from: 'in_maintenance', to: 'ready_for_pickup', cost: p.chargedAmount
    });
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'ASSISTENCIA_EXTERNA_CONCLUIDA', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, valor_cobrado: p.chargedAmount, pagamento: p.paymentStatus }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Cancela uma assistência ainda não concluída (interna: aparelho volta ao estoque sem custo)
  cancelAssistance(p: { tenantId: string; osId: string; userId: string; userRole: string; reason: string }): AssistanceResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return fail('Ordem de serviço não encontrada.');
    if (os.closed_at || os.status === 'ready_for_pickup' || os.status === 'delivered' || os.status === 'cancelled') {
      return fail('Esta ordem de serviço não pode mais ser cancelada.');
    }
    if (!p.reason.trim()) return fail('Informe o motivo do cancelamento.');

    const now = new Date().toISOString();
    const from = os.status;

    if (os.origin === 'internal' && os.device_id) {
      const device = this.devices.find(d => d.id === os.device_id && d.tenant_id === p.tenantId);
      if (device && device.status === 'in_maintenance') device.status = 'available';
      const repair = this.internalRepairs.find(r => r.service_order_id === os.id);
      if (repair) {
        repair.status = 'completed';
        repair.diagnosis = 'Assistência cancelada: ' + p.reason.trim();
        repair.repair_cost = 0;
        repair.completed_at = now;
      }
    }

    os.status = 'cancelled';
    os.closed_at = now;
    this.orderMovement(
      os,
      'assistance_cancelled',
      os.origin === 'internal'
        ? `Assistência cancelada: aparelho devolvido ao estoque (OS #${os.os_number})`
        : `Assistência cancelada (OS #${os.os_number})`,
      { userId: p.userId, from, to: 'cancelled', notes: p.reason.trim() }
    );
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'ASSISTENCIA_CANCELADA', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, motivo: p.reason.trim() }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Orçamento recusado: o aparelho volta ao dono sem reparo e a OS é encerrada (sem cobrança)
  returnRejectedOrder(p: { tenantId: string; osId: string; userId: string }): AssistanceResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return fail('Ordem de serviço não encontrada.');
    if (os.origin !== 'external' || os.status !== 'rejected') return fail('Esta ordem não está com o orçamento recusado.');
    if (os.closed_at) return fail('Esta ordem de serviço já foi encerrada.');

    const now = new Date().toISOString();
    os.delivered_by_seller_id = p.userId;
    os.delivered_at = now;
    os.closed_at = now;
    this.orderMovement(os, 'external_delivered', `Aparelho devolvido ao proprietário sem reparo (OS #${os.os_number})`, {
      userId: p.userId, from: 'rejected', to: 'rejected', notes: os.quote_rejected_reason
    });
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: this.roleOf(p.userId),
      action: 'APARELHO_DEVOLVIDO_SEM_REPARO', module: 'Assistência Técnica', record_id: os.id,
      details: { os_numero: os.os_number, motivo: os.quote_rejected_reason }
    });
    this.saveToStorage();
    return { ok: true, order: os };
  }

  // Técnico marca OS externa como pronta (mantido para a bancada técnica)
  markServiceOrderReady(payload: {
    tenantId: string;
    osId: string;
    technicianId: string;
  }): boolean {
    const os = this.findOrder(payload.tenantId, payload.osId);
    if (!os || os.origin !== 'external' || os.closed_at || os.status !== 'in_maintenance') return false;

    os.status = 'ready_for_pickup';
    os.completed_at = new Date().toISOString();

    this.orderMovement(os, 'external_completed', `Manutenção concluída. Aguardando retirada (OS #${os.os_number})`, {
      userId: payload.technicianId, from: 'in_maintenance', to: 'ready_for_pickup'
    });
    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.technicianId,
      user_role: 'technician',
      action: 'MANUTENCAO_CONCLUIDA',
      module: 'Assistência Técnica',
      record_id: payload.osId,
      details: { os_numero: os.os_number }
    });

    this.saveToStorage();
    return true;
  }

  // Entrega ao proprietário: encerra a OS externa (recebimento só é lançado uma vez)
  sellerCheckoutServiceOrder(payload: {
    tenantId: string;
    osId: string;
    sellerId: string;
    paymentMethod: PaymentMethod;
    paidAmount: number;
  }): boolean {
    const os = this.findOrder(payload.tenantId, payload.osId);
    if (!os || os.origin !== 'external' || os.closed_at || os.status !== 'ready_for_pickup') return false;

    const now = new Date().toISOString();
    if (os.payment_status !== 'paid') {
      os.payment_method = payload.paymentMethod;
      os.paid_amount = payload.paidAmount;
      os.payment_status = 'paid';
    }
    os.status = 'delivered';
    os.received_by_seller_id = os.received_by_seller_id || payload.sellerId;
    os.delivered_by_seller_id = payload.sellerId;
    os.delivered_at = now;
    os.closed_at = now;

    this.orderMovement(os, 'external_delivered', `Aparelho entregue ao proprietário (OS #${os.os_number})`, {
      userId: payload.sellerId, from: 'ready_for_pickup', to: 'delivered', cost: Number(os.paid_amount) || 0
    });
    this.addAuditLog({
      tenant_id: payload.tenantId,
      user_id: payload.sellerId,
      user_role: this.roleOf(payload.sellerId),
      action: 'APARELHO_ENTREGUE_RECEBIDO',
      module: 'Assistência Técnica',
      record_id: payload.osId,
      details: { os_numero: os.os_number, valor_recebido: os.paid_amount, pagamento: os.payment_method }
    });

    this.saveToStorage();
    return true;
  }

  // Manutenção Interna (bancada técnica): usa a mesma OS interna, sem duplicar fluxo
  createInternalRepair(payload: {
    tenantId: string;
    deviceId: string;
    technicianId: string;
    issueDescription: string;
  }): AssistanceResult {
    return this.sendDeviceToAssistance({
      tenantId: payload.tenantId,
      deviceId: payload.deviceId,
      userId: payload.technicianId,
      userRole: 'technician',
      defect: payload.issueDescription,
      startMaintenance: true
    });
  }

  completeInternalRepair(payload: {
    tenantId: string;
    repairId: string;
    technicianId: string;
    diagnosis: string;
    partsUsed: string;
    repairCost: number;
  }): AssistanceResult {
    const repair = this.internalRepairs.find(r => r.id === payload.repairId && r.tenant_id === payload.tenantId);
    if (!repair || !repair.service_order_id) return fail('Manutenção não encontrada.');
    if (repair.status === 'completed') return fail('Esta manutenção já foi concluída.');

    const os = this.findOrder(payload.tenantId, repair.service_order_id);
    if (os && (os.status === 'waiting_diagnosis' || os.status === 'in_diagnosis')) {
      const started = this.updateAssistanceStatus({
        tenantId: payload.tenantId, osId: os.id, userId: payload.technicianId, newStatus: 'in_maintenance'
      });
      if (!started.ok) return started;
    }

    return this.completeInternalAssistance({
      tenantId: payload.tenantId,
      osId: repair.service_order_id,
      userId: payload.technicianId,
      userRole: 'technician',
      serviceDone: payload.diagnosis,
      partsUsed: payload.partsUsed,
      partsCost: payload.repairCost,
      serviceCost: 0
    });
  }

  // ==========================================================================
  // GARANTIAS COMERCIAIS
  // ==========================================================================

  private event(description: string, userId?: string, notes?: string) {
    return {
      at: new Date().toISOString(),
      user_id: userId,
      user_name: this.profiles.find(p => p.id === userId)?.full_name,
      description,
      notes
    };
  }

  // Cria (uma única vez) a garantia do aparelho de um item de venda
  private ensureWarrantyForItem(sale: Sale, item: SaleItem, userId?: string): Warranty | undefined {
    if (item.item_type !== 'device' || !item.device_id) return undefined;
    const existing = this.warranties.find(w => w.sale_item_id === item.id);
    if (existing) return existing;

    const device = this.devices.find(d => d.id === item.device_id);
    if (!device) return undefined;
    if (!this.getTenantFeatures(sale.tenant_id).auto_warranty) return undefined;

    const days = WARRANTY_DAYS;
    item.warranty_days = days;
    const start = toLocalDay(new Date(sale.created_at));
    const returned = Boolean(item.returned_at);
    const warranty: Warranty = {
      id: uid('war-'),
      tenant_id: sale.tenant_id,
      sale_id: sale.id,
      sale_item_id: item.id,
      device_id: device.id,
      imei: device.imei,
      customer_id: sale.customer_id,
      sale_date: sale.created_at,
      warranty_days: days,
      start_date: start,
      end_date: addDays(start, days),
      terms: DEFAULT_WARRANTY_TERMS,
      status: returned ? 'cancelled' : 'active',
      history: [this.event(`Garantia de ${days} dias registrada na venda #${sale.sale_number}`, userId)],
      created_at: new Date().toISOString()
    };
    this.warranties.unshift(warranty);
    return warranty;
  }

  /** Aparelho da loja com este IMEI, em qualquer situação (disponível, vendido, baixado...). */
  findDeviceByImei(tenantId: string, imei: string, exceptId?: string): Device | undefined {
    const clean = normalizeImei(imei);
    if (!clean) return undefined;
    return this.devices.find(d => d.tenant_id === tenantId && d.id !== exceptId && normalizeImei(d.imei) === clean);
  }

  /** Encerra as garantias ativas de um aparelho que voltou a pertencer à loja. */
  closeWarrantiesForDevice(deviceId: string, reason: string, userId?: string): string[] {
    const active = this.warranties.filter(w => w.device_id === deviceId && w.status === 'active');
    active.forEach(w => this.cancelWarranty(w, reason, userId));
    return active.map(w => w.id);
  }

  private cancelWarranty(w: Warranty, reason: string, userId?: string) {
    w.status = 'cancelled';
    w.cancelled_at = new Date().toISOString();
    w.cancel_reason = reason;
    w.history.push(this.event('Garantia cancelada', userId, reason));
  }

  // Consulta por IMEI (assistência): devolve a garantia mais recente daquele aparelho
  findWarrantyByImei(tenantId: string, imei: string): Warranty | undefined {
    const clean = normalizeImei(imei);
    if (!clean) return undefined;
    const list = this.warranties
      .filter(w => w.tenant_id === tenantId && normalizeImei(w.imei) === clean)
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
    return list.find(w => w.status === 'active') || list[0];
  }

  setWarrantyAnalysis(p: {
    tenantId: string; osId: string; userId: string;
    result: 'pending' | 'covered' | 'not_covered'; notes?: string;
  }): OpResult {
    const os = this.findOrder(p.tenantId, p.osId);
    if (!os) return opFail('Ordem de serviço não encontrada.');
    os.warranty_analysis = p.result;
    os.warranty_analysis_notes = p.notes?.trim() || undefined;
    const warranty = this.warranties.find(w => w.id === os.warranty_id);
    if (warranty) {
      const label = p.result === 'covered' ? 'coberto' : p.result === 'not_covered' ? 'não coberto' : 'em análise';
      warranty.history.push(this.event(`Análise de garantia na OS #${os.os_number}: ${label}`, p.userId, p.notes));
    }
    this.saveToStorage();
    return { ok: true };
  }

  // ==========================================================================
  // CRÉDITO DO CLIENTE
  // ==========================================================================

  getCustomerCreditBalance(tenantId: string, customerId: string): number {
    const cents = this.customerCredits
      .filter(c => c.tenant_id === tenantId && c.customer_id === customerId)
      .reduce((acc, c) => acc + toCents(c.balance), 0);
    return cents / 100;
  }

  // Consome do crédito mais antigo para o mais novo; o saldo nunca fica negativo
  private consumeCustomerCredit(tenantId: string, customerId: string, cents: number, saleId: string) {
    let remaining = cents;
    const now = new Date().toISOString();
    this.customerCredits
      .filter(c => c.tenant_id === tenantId && c.customer_id === customerId && toCents(c.balance) > 0)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach(credit => {
        if (remaining <= 0) return;
        const used = Math.min(remaining, toCents(credit.balance));
        credit.balance = (toCents(credit.balance) - used) / 100;
        credit.usages.push({ sale_id: saleId, amount: used / 100, at: now });
        remaining -= used;
      });
  }

  // ==========================================================================
  // TROCAS & DEVOLUÇÕES (sempre vinculadas à venda original; a venda nunca é apagada)
  // ==========================================================================

  private isManager(role: string) {
    return role === 'admin' || role === 'super_admin';
  }

  // Receita da venda = itens ainda ativos + valores retidos em devoluções parciais
  private recalcSaleTotals(sale: Sale) {
    const active = (sale.items || []).filter(it => !it.returned_at);
    const subtotal = active.reduce((acc, it) => acc + toCents(it.unit_price) * it.quantity, 0);
    const discount = active.reduce((acc, it) => acc + toCents(it.discount) * it.quantity, 0);
    const retained = (sale.adjustments || []).reduce((acc, a) => acc + toCents(a.retained_amount), 0);
    const cost =
      active.reduce((acc, it) => acc + toCents(it.unit_cost) * it.quantity, 0) +
      (sale.gifts || []).reduce((acc, g) => acc + toCents(g.unit_cost) * g.quantity, 0);

    sale.subtotal = subtotal / 100;
    sale.discount_amount = discount / 100;
    sale.total_amount = (subtotal - discount + retained) / 100;
    sale.total_cost = cost / 100;
    sale.gross_profit = (subtotal - discount + retained - cost) / 100;
  }

  createReturnRequest(p: {
    tenantId: string; saleId: string; saleItemId: string; userId: string; userRole: string;
    reason: string; notes?: string; resolution: ReturnResolution;
  }): OpResult<ReturnRequest> {
    const sale = this.sales.find(s => s.id === p.saleId && s.tenant_id === p.tenantId);
    if (!sale) return opFail('Venda original não encontrada.');
    if (sale.status !== 'completed') return opFail('A venda está cancelada e não aceita trocas ou devoluções.');

    const item = (sale.items || []).find(it => it.id === p.saleItemId);
    if (!item || item.item_type !== 'device' || !item.device_id) return opFail('Selecione o aparelho que será trocado ou devolvido.');
    if (item.returned_at) return opFail('Este item já foi trocado ou devolvido.');
    if (!p.reason.trim()) return opFail('Informe o motivo da solicitação.');

    const active = this.returnRequests.find(
      r => r.sale_item_id === item.id && ['open', 'in_review', 'approved'].includes(r.status)
    );
    if (active) return opFail(`Já existe a solicitação #${active.request_number} em andamento para este item.`);

    const device = this.devices.find(d => d.id === item.device_id);
    const now = new Date().toISOString();
    const request: ReturnRequest = {
      id: uid('ret-'),
      tenant_id: p.tenantId,
      request_number: Math.max(100, ...this.returnRequests.map(r => r.request_number)) + 1,
      sale_id: sale.id,
      sale_item_id: item.id,
      device_id: item.device_id,
      imei: device?.imei || '',
      customer_id: sale.customer_id,
      requested_by: p.userId,
      reason: p.reason.trim(),
      notes: p.notes?.trim() || undefined,
      resolution: p.resolution,
      status: 'open',
      item_paid_amount: Number(item.total_price),
      history: [this.event('Solicitação aberta', p.userId, p.reason.trim())],
      created_at: now
    };
    this.returnRequests.unshift(request);
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'TROCA_DEVOLUCAO_SOLICITADA', module: 'Trocas & Devoluções', record_id: request.id,
      details: { solicitacao: request.request_number, venda: sale.sale_number, imei: request.imei, tipo: p.resolution }
    });
    this.saveToStorage();
    return { ok: true, data: request };
  }

  updateReturnStatus(p: {
    tenantId: string; requestId: string; userId: string; userRole: string;
    newStatus: 'in_review' | 'approved' | 'rejected' | 'cancelled'; notes?: string; resolution?: ReturnResolution;
  }): OpResult<ReturnRequest> {
    const r = this.returnRequests.find(x => x.id === p.requestId && x.tenant_id === p.tenantId);
    if (!r) return opFail('Solicitação não encontrada.');

    const allowed: Record<string, string[]> = {
      in_review: ['open'],
      approved: ['open', 'in_review'],
      rejected: ['open', 'in_review'],
      cancelled: ['open', 'in_review', 'approved']
    };
    if (!allowed[p.newStatus].includes(r.status)) return opFail('Esta mudança de status não é permitida.');

    const manager = this.isManager(p.userRole);
    if (p.newStatus !== 'cancelled' && !manager) return opFail('Somente administradores podem analisar, aprovar ou recusar solicitações.');
    if (p.newStatus === 'cancelled' && !manager && r.requested_by !== p.userId) {
      return opFail('Você só pode cancelar solicitações que registrou.');
    }
    if ((p.newStatus === 'rejected' || p.newStatus === 'cancelled') && !p.notes?.trim()) {
      return opFail('Informe o motivo da decisão.');
    }

    r.status = p.newStatus;
    if (p.newStatus === 'approved' && p.resolution) r.resolution = p.resolution;
    const labels = { in_review: 'Em análise', approved: 'Aprovada', rejected: 'Recusada', cancelled: 'Cancelada' };
    r.history.push(this.event(`Status: ${labels[p.newStatus]}`, p.userId, p.notes?.trim()));
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'TROCA_DEVOLUCAO_STATUS', module: 'Trocas & Devoluções', record_id: r.id,
      details: { solicitacao: r.request_number, status: p.newStatus, motivo: p.notes }
    });
    this.saveToStorage();
    return { ok: true, data: r };
  }

  // Conclui a solicitação aprovada. Tudo é validado antes de qualquer alteração (tudo ou nada).
  completeReturn(p: {
    tenantId: string; requestId: string; userId: string; userRole: string;
    refundAmount?: number; refundMethod?: PaymentMethod;
    creditAmount?: number;
    newDeviceId?: string; differenceMethod?: PaymentMethod;
    substituteWarranty?: { mode: 'keep' | 'new' };
    notes?: string;
  }): OpResult<ReturnRequest> {
    if (!this.isManager(p.userRole)) return opFail('Somente administradores podem concluir trocas e devoluções.');
    const r = this.returnRequests.find(x => x.id === p.requestId && x.tenant_id === p.tenantId);
    if (!r) return opFail('Solicitação não encontrada.');
    if (r.status === 'completed') return opFail('Esta solicitação já foi concluída.');
    if (r.status !== 'approved') return opFail('A solicitação precisa estar aprovada para ser concluída.');

    const sale = this.sales.find(s => s.id === r.sale_id && s.tenant_id === p.tenantId);
    const item = sale?.items?.find(it => it.id === r.sale_item_id);
    const device = this.devices.find(d => d.id === r.device_id && d.tenant_id === p.tenantId);
    if (!sale || !item || !device) return opFail('Venda, item ou aparelho original não encontrado.');
    if (sale.status !== 'completed') return opFail('A venda original está cancelada.');
    if (item.returned_at) return opFail('Este item já foi trocado ou devolvido.');
    if (device.status !== 'sold') return opFail('O aparelho original não consta como vendido.');

    const paidCents = toCents(item.total_price);
    const now = new Date().toISOString();
    const originalWarranty = this.warranties.find(w => w.sale_item_id === item.id);

    // ---- validações específicas de cada resolução ----
    let newDevice: Device | undefined;
    let refundCents = 0;
    let creditCents = 0;
    let differenceCents = 0;

    if (r.resolution === 'refund') {
      refundCents = toCents(p.refundAmount ?? item.total_price);
      if (!(refundCents > 0) || refundCents > paidCents) return opFail('O reembolso deve ser maior que zero e no máximo o valor pago pelo item.');
      if (!p.refundMethod) return opFail('Informe a forma de reembolso.');
    } else if (r.resolution === 'credit') {
      creditCents = toCents(p.creditAmount ?? item.total_price);
      if (!(creditCents > 0) || creditCents > paidCents) return opFail('O crédito deve ser maior que zero e no máximo o valor pago pelo item.');
    } else {
      newDevice = this.devices.find(d => d.id === p.newDeviceId && d.tenant_id === p.tenantId);
      if (!newDevice) return opFail('Selecione o aparelho substituto.');
      if (newDevice.status !== 'available') return opFail('O aparelho substituto não está disponível no estoque.');
      if (newDevice.id === device.id) return opFail('O substituto não pode ser o mesmo aparelho.');
      differenceCents = toCents(newDevice.suggested_price) - paidCents;
      if (differenceCents !== 0 && !p.differenceMethod) {
        return opFail(differenceCents > 0 ? 'Informe como o cliente pagará a diferença.' : 'Informe como a diferença será devolvida ao cliente.');
      }
    }

    // ---- efeitos (a partir daqui nada falha) ----
    item.returned_at = now;
    item.return_request_id = r.id;
    item.return_type = r.resolution;
    sale.adjustments = sale.adjustments || [];

    // Aparelho original volta a pertencer à loja, mas fica BLOQUEADO até avaliação
    device.status = 'awaiting_evaluation';
    device.sold_at = undefined;
    this.recordMovement({
      tenant_id: p.tenantId, device_id: device.id, imei: device.imei,
      movement_type: 'returned_by_customer',
      description: `Devolvido pelo cliente (solicitação #${r.request_number}, venda #${sale.sale_number}). Propriedade retornou à loja; aguardando avaliação`,
      from_status: 'sold', to_status: 'awaiting_evaluation', user_id: p.userId, notes: r.reason
    });

    if (r.resolution === 'refund') {
      sale.adjustments.push({
        id: uid('adj-'), type: 'refund', amount: refundCents / 100, retained_amount: (paidCents - refundCents) / 100,
        payment_method: p.refundMethod, return_request_id: r.id,
        description: `Reembolso da solicitação #${r.request_number}`, created_by: p.userId, created_at: now
      });
      r.refund_amount = refundCents / 100;
      r.refund_method = p.refundMethod;
      if (originalWarranty) this.cancelWarranty(originalWarranty, `Aparelho devolvido com reembolso (solicitação #${r.request_number})`, p.userId);
    } else if (r.resolution === 'credit') {
      const credit: CustomerCredit = {
        id: uid('cred-'), tenant_id: p.tenantId, customer_id: r.customer_id, origin_sale_id: sale.id,
        return_request_id: r.id, amount: creditCents / 100, balance: creditCents / 100, usages: [], created_at: now
      };
      this.customerCredits.unshift(credit);
      sale.adjustments.push({
        id: uid('adj-'), type: 'credit', amount: creditCents / 100, retained_amount: (paidCents - creditCents) / 100,
        payment_method: 'store_credit', return_request_id: r.id,
        description: `Crédito para compra futura (solicitação #${r.request_number})`, created_by: p.userId, created_at: now
      });
      r.credit_id = credit.id;
      r.credit_amount = creditCents / 100;
      if (originalWarranty) this.cancelWarranty(originalWarranty, `Aparelho devolvido com crédito (solicitação #${r.request_number})`, p.userId);
    } else if (newDevice) {
      // Novo aparelho entra na MESMA venda (sem duplicar receita: sai o item antigo, entra o novo)
      const mode = p.substituteWarranty?.mode || 'keep';
      const days = WARRANTY_DAYS;
      const newItem: SaleItem = {
        id: uid('sitem-'), sale_id: sale.id, item_type: 'device', device_id: newDevice.id, quantity: 1,
        unit_cost: Number(newDevice.acquisition_cost) + Number(newDevice.accumulated_repair_cost),
        unit_price: Number(newDevice.suggested_price), discount: 0, total_price: Number(newDevice.suggested_price),
        warranty_days: days
      };
      sale.items = [...(sale.items || []), newItem];
      newDevice.status = 'sold';
      newDevice.sold_at = now;
      this.recordMovement({
        tenant_id: p.tenantId, device_id: newDevice.id, imei: newDevice.imei, movement_type: 'sold',
        description: `Entregue em troca do IMEI ${device.imei} (solicitação #${r.request_number}, venda #${sale.sale_number})`,
        from_status: 'available', to_status: 'sold', cost: Number(newDevice.suggested_price), user_id: p.userId
      });
      sale.adjustments.push({
        id: uid('adj-'), type: 'exchange_difference', amount: -differenceCents / 100, retained_amount: 0,
        payment_method: p.differenceMethod, return_request_id: r.id,
        description:
          differenceCents > 0 ? `Diferença paga pelo cliente na troca #${r.request_number}`
          : differenceCents < 0 ? `Diferença devolvida ao cliente na troca #${r.request_number}`
          : `Troca #${r.request_number} sem diferença de valores`,
        created_by: p.userId, created_at: now
      });

      // Garantia do substituto: mantém o prazo original (padrão) ou novo prazo registrado explicitamente
      const start = mode === 'new' ? toLocalDay(new Date(now)) : (originalWarranty?.start_date || toLocalDay(new Date(sale.created_at)));
      const substitute: Warranty = {
        id: uid('war-'), tenant_id: p.tenantId, sale_id: sale.id, sale_item_id: newItem.id,
        device_id: newDevice.id, imei: newDevice.imei, customer_id: sale.customer_id, sale_date: sale.created_at,
        warranty_days: days, start_date: start,
        end_date: mode === 'new' ? addDays(start, days) : (originalWarranty?.end_date || addDays(start, days)),
        terms: originalWarranty?.terms || DEFAULT_WARRANTY_TERMS, status: 'active',
        replaces_warranty_id: originalWarranty?.id,
        history: [this.event(
          mode === 'new'
            ? `Garantia do aparelho substituto com nova vigência de ${days} dias a partir da troca (troca #${r.request_number}, IMEI original ${device.imei})`
            : `Garantia do aparelho substituto mantendo o prazo original (troca #${r.request_number}, IMEI original ${device.imei})`,
          p.userId
        )],
        created_at: now
      };
      this.warranties.unshift(substitute);
      if (originalWarranty) {
        originalWarranty.replaced_by_warranty_id = substitute.id;
        this.cancelWarranty(originalWarranty, `Aparelho substituído pelo IMEI ${newDevice.imei} (troca #${r.request_number})`, p.userId);
      }
      r.new_device_id = newDevice.id;
      r.new_device_price = Number(newDevice.suggested_price);
      r.difference_amount = differenceCents / 100;
      r.difference_method = p.differenceMethod;
    }

    this.recalcSaleTotals(sale);

    r.status = 'completed';
    r.completed_at = now;
    r.device_destination = 'pending_evaluation';
    r.history.push(this.event('Solicitação concluída', p.userId, p.notes?.trim()));
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action: 'TROCA_DEVOLUCAO_CONCLUIDA', module: 'Trocas & Devoluções', record_id: r.id,
      details: {
        solicitacao: r.request_number, venda: sale.sale_number, tipo: r.resolution, imei_original: device.imei,
        reembolso: r.refund_amount, credito: r.credit_amount, novo_imei: newDevice?.imei, diferenca: r.difference_amount
      }
    });
    this.saveToStorage();
    return { ok: true, data: r };
  }

  // Avaliação do aparelho devolvido: só então ele volta ao estoque ou segue para a Assistência Interna
  resolveReturnedDevice(p: {
    tenantId: string; requestId: string; userId: string; userRole: string;
    destination: 'stock' | 'assistance'; defect?: string; notes?: string;
  }): OpResult<ReturnRequest> {
    if (!this.isManager(p.userRole)) return opFail('Somente administradores podem definir o destino do aparelho.');
    const r = this.returnRequests.find(x => x.id === p.requestId && x.tenant_id === p.tenantId);
    if (!r) return opFail('Solicitação não encontrada.');
    if (r.status !== 'completed' || r.device_destination !== 'pending_evaluation') {
      return opFail('Este aparelho não está aguardando avaliação.');
    }
    const device = this.devices.find(d => d.id === r.device_id && d.tenant_id === p.tenantId);
    if (!device || device.status !== 'awaiting_evaluation') return opFail('O aparelho não está aguardando avaliação.');

    if (p.destination === 'assistance') {
      if (!p.defect?.trim()) return opFail('Informe o defeito para abrir a assistência interna.');
      device.status = 'available'; // liberação técnica imediata para abrir a OS no mesmo aparelho (mesmo IMEI)
      const sent = this.sendDeviceToAssistance({
        tenantId: p.tenantId, deviceId: device.id, userId: p.userId, userRole: p.userRole,
        defect: p.defect, notes: `Aparelho devolvido na solicitação #${r.request_number}. ${p.notes || ''}`.trim()
      });
      if (!sent.ok) {
        device.status = 'awaiting_evaluation';
        return opFail(sent.error || 'Não foi possível abrir a assistência interna.');
      }
      r.device_destination = 'sent_to_assistance';
      r.service_order_id = sent.order?.id;
      r.history.push(this.event(`Aparelho avaliado e enviado para Assistência Interna (OS #${sent.order?.os_number})`, p.userId, p.notes));
    } else {
      device.status = 'available';
      this.recordMovement({
        tenant_id: p.tenantId, device_id: device.id, imei: device.imei, movement_type: 'return_released_to_stock',
        description: `Avaliado e liberado para o estoque disponível (solicitação #${r.request_number})`,
        from_status: 'awaiting_evaluation', to_status: 'available', user_id: p.userId, notes: p.notes
      });
      r.device_destination = 'returned_to_stock';
      r.history.push(this.event('Aparelho avaliado e liberado para o estoque disponível', p.userId, p.notes));
    }

    this.saveToStorage();
    return { ok: true, data: r };
  }

  // ==========================================================================
  // FINANCEIRO — DESPESAS (o status só muda por aqui; DRE e fluxo de caixa são
  // calculados a partir do status, então pagar/reverter atualiza tudo de uma vez)
  // ==========================================================================

  saveExpense(p: {
    tenantId: string; userId: string; userRole: string; expenseId?: string;
    description: string; category: ExpenseCategory; amount: number; dueDate: string;
    paymentMethod?: PaymentMethod; notes?: string;
    status: 'pending' | 'paid';
    paymentDate?: string; paidMethod?: PaymentMethod;
    receipt?: { name: string; url: string } | null; // null = remover comprovante
  }): OpResult<Expense> {
    if (p.userRole !== 'admin' && p.userRole !== 'super_admin') {
      return opFail('Somente administradores podem lançar ou alterar despesas.');
    }
    if (!p.description.trim()) return opFail('Informe a descrição da despesa.');
    if (!(p.amount > 0)) return opFail('Informe um valor maior que zero.');
    if (!p.dueDate) return opFail('Informe a data de vencimento.');
    if (p.status === 'paid') {
      if (!p.paymentDate) return opFail('Informe a data do pagamento.');
      if (!p.paidMethod) return opFail('Informe a forma de pagamento utilizada.');
    }

    const existing = p.expenseId
      ? this.expenses.find(e => e.id === p.expenseId && e.tenant_id === p.tenantId)
      : undefined;
    if (p.expenseId && !existing) return opFail('Despesa não encontrada.');

    const previousStatus = existing?.status;
    const now = new Date().toISOString();
    const expense: Expense = existing || {
      id: uid('exp-'), tenant_id: p.tenantId, category: p.category, description: '', amount: 0,
      due_date: p.dueDate, status: 'pending', created_by: p.userId, created_at: now
    };

    expense.description = p.description.trim();
    expense.category = p.category;
    expense.amount = Math.round(p.amount * 100) / 100;
    expense.due_date = p.dueDate;
    expense.payment_method = p.paymentMethod;
    expense.notes = p.notes?.trim() || undefined;
    expense.status = p.status;

    if (p.status === 'paid') {
      expense.payment_date = p.paymentDate;
      expense.paid_method = p.paidMethod;
      if (p.receipt === null) { expense.receipt_name = undefined; expense.receipt_url = undefined; }
      else if (p.receipt) { expense.receipt_name = p.receipt.name; expense.receipt_url = p.receipt.url; }
    } else {
      // Voltou para pendente: o pagamento deixa de existir (sai da DRE e do fluxo de caixa)
      expense.payment_date = undefined;
      expense.paid_method = undefined;
      expense.receipt_name = undefined;
      expense.receipt_url = undefined;
    }

    if (!existing) this.expenses.unshift(expense);

    const userName = this.profiles.find(u => u.id === p.userId)?.full_name;
    const action = !existing
      ? 'DESPESA_LANCADA'
      : previousStatus !== 'paid' && p.status === 'paid'
      ? 'DESPESA_MARCADA_COMO_PAGA'
      : previousStatus === 'paid' && p.status === 'pending'
      ? 'DESPESA_REVERTIDA_PARA_PENDENTE'
      : 'DESPESA_EDITADA';
    this.addAuditLog({
      tenant_id: p.tenantId, user_id: p.userId, user_role: p.userRole,
      action, module: 'Financeiro', record_id: expense.id,
      details: {
        usuario: userName, descricao: expense.description, valor: expense.amount, categoria: expense.category,
        status_anterior: previousStatus, status_atual: expense.status,
        data_pagamento: expense.payment_date, forma_utilizada: expense.paid_method
      }
    });
    this.saveToStorage();
    return { ok: true, data: expense };
  }


  // --------------------------------------------------------------------------
  // LOJAS: CRIAÇÃO COMPLETA E GESTÃO POSTERIOR (EXCLUSIVO SUPER ADMIN)
  // --------------------------------------------------------------------------

  /** Recursos habilitados da loja (lojas anteriores a esta configuração têm tudo habilitado). */
  getTenantFeatures(tenantId?: string | null): TenantFeatures {
    const saved = (tenantId && this.tenantSettings[tenantId]) || {};
    const features = { ...DEFAULT_FEATURES };
    (Object.keys(features) as (keyof TenantFeatures)[]).forEach(key => {
      if (typeof saved[key] === 'boolean') features[key] = saved[key] as boolean;
    });
    return features;
  }

  getTenantTheme(tenantId: string): TenantTheme {
    const tenant = this.tenants.find(t => t.id === tenantId);
    return this.themes[tenantId] || buildDefaultTheme(tenantId, tenant?.trade_name || 'Loja');
  }

  getTenantDocument(tenantId: string, type: TenantDocumentType): TenantDocument | undefined {
    return this.tenantDocuments.find(d => d.tenant_id === tenantId && d.type === type);
  }

  /** Acesso mais recente de qualquer usuário da loja. */
  getTenantLastAccess(tenantId: string): string | undefined {
    return this.profiles
      .filter(p => p.tenant_id === tenantId && p.last_access_at)
      .map(p => p.last_access_at as string)
      .sort()
      .pop();
  }

  isEmailTaken(email: string, exceptUserId?: string): boolean {
    const clean = email.trim().toLowerCase();
    return this.profiles.some(p => p.id !== exceptUserId && p.email.toLowerCase() === clean);
  }

  isCnpjTaken(cnpj: string, exceptTenantId?: string): boolean {
    return this.tenants.some(t => t.id !== exceptTenantId && sameCnpj(t.cnpj, cnpj));
  }

  private superAdminOnly(userId: string): string | null {
    return this.profiles.find(p => p.id === userId)?.role === 'super_admin'
      ? null
      : 'Apenas o Super Administrador pode executar esta ação.';
  }

  /**
   * Cria a loja inteira de uma vez: tenant, identidade visual, administrador, equipe inicial,
   * configurações, plano e documentos. Tudo é validado antes da primeira gravação, então
   * ou a loja nasce completa ou nada é criado.
   */
  createTenantWithSetup(payload: TenantSetupPayload, superAdminId: string): OpResult<TenantSetupResult> {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);

    const company = payload.company;
    if (!company.trade_name?.trim() || !company.name?.trim()) return opFail('Informe o nome fantasia e a razão social.');
    if (this.tenants.some(t => t.id === payload.tenantId)) return opFail('Esta loja já foi criada.');
    if (company.cnpj && this.isCnpjTaken(company.cnpj)) return opFail('Já existe uma loja cadastrada com este CNPJ.');

    const users = [payload.admin, ...payload.sellers, ...payload.technicians];
    const emails = users.map(u => u.email.trim().toLowerCase());
    const repeated = emails.find((e, i) => emails.indexOf(e) !== i);
    if (repeated) return opFail(`O e-mail ${repeated} foi informado para mais de um usuário.`);
    const taken = emails.find(e => this.isEmailTaken(e));
    if (taken) return opFail(`Já existe um usuário com o e-mail ${taken}.`);
    if (users.some(u => !u.full_name.trim() || !u.email.trim() || !u.password)) {
      return opFail('Todos os usuários precisam de nome, e-mail e senha.');
    }

    const now = new Date().toISOString();
    const tenantId = payload.tenantId;
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

    const tenant: Tenant = {
      id: tenantId,
      name: company.name.trim(),
      trade_name: company.trade_name.trim(),
      cnpj: clean(company.cnpj),
      state_registration: clean(company.state_registration),
      email: company.email.trim().toLowerCase(),
      phone: company.phone.trim(),
      whatsapp: clean(company.whatsapp),
      website: clean(company.website),
      address_zipcode: clean(company.address_zipcode),
      address_street: clean(company.address_street),
      address_number: clean(company.address_number),
      address_complement: clean(company.address_complement),
      address_neighborhood: clean(company.address_neighborhood),
      address_city: clean(company.address_city),
      address_state: clean(company.address_state)?.toUpperCase(),
      status: payload.status,
      plan: payload.plan,
      plan_start_date: payload.planStartDate,
      plan_due_date: payload.planDueDate,
      internal_notes: clean(payload.notes),
      created_at: now
    };

    const toProfile = (u: TenantSetupUser, role: UserProfile['role']): UserProfile => ({
      id: uid('user-'),
      tenant_id: tenantId,
      role,
      full_name: u.full_name.trim(),
      email: u.email.trim().toLowerCase(),
      phone: clean(u.phone),
      cpf: clean(u.cpf),
      is_active: true,
      created_at: now
    });

    const admin = toProfile(payload.admin, 'admin');
    const sellers = payload.sellers.map(u => toProfile(u, 'seller'));
    const technicians = payload.technicians.map(u => toProfile(u, 'technician'));

    this.tenants.unshift(tenant);
    this.themes[tenantId] = { ...payload.theme, id: 'theme-' + tenantId, tenant_id: tenantId };
    this.profiles.push(admin, ...sellers, ...technicians);
    this.tenantSettings[tenantId] = { ...payload.features, warranty_days: WARRANTY_DAYS };
    this.tenantDocuments = [
      ...this.tenantDocuments.filter(d => d.tenant_id !== tenantId),
      ...payload.documents.map(d => ({ ...d, tenant_id: tenantId }))
    ];

    this.addAuditLog({
      tenant_id: tenantId,
      user_id: superAdminId,
      user_role: 'super_admin',
      action: 'LOJA_CADASTRADA',
      module: 'Super Admin',
      record_id: tenantId,
      details: {
        razao_social: tenant.name,
        nome_fantasia: tenant.trade_name,
        cnpj: tenant.cnpj,
        plano: tenant.plan,
        situacao: tenant.status,
        administrador: admin.email,
        vendedores: sellers.length,
        tecnicos: technicians.length,
        documentos: payload.documents.map(d => d.type),
        recursos: (Object.keys(payload.features) as (keyof TenantFeatures)[]).filter(k => payload.features[k])
      }
    });
    return { ok: true, data: { tenant, admin, sellers: sellers.length, technicians: technicians.length } };
  }

  updateTenantCompany(tenantId: string, patch: Partial<Tenant>, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return opFail('Loja não encontrada.');
    if (patch.cnpj && this.isCnpjTaken(patch.cnpj, tenantId)) return opFail('Já existe uma loja cadastrada com este CNPJ.');

    const { id: _id, created_at: _created, status: _status, ...allowed } = patch;
    Object.assign(tenant, allowed);
    this.addAuditLog({
      tenant_id: tenantId, user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_DADOS_ATUALIZADOS', module: 'Super Admin', record_id: tenantId,
      details: { campos: Object.keys(allowed).filter(k => k !== 'internal_notes') }
    });
    if (this.isRealMode) void pushTenant(tenant, superAdminId);
    return { ok: true };
  }

  setTenantStatus(tenantId: string, status: TenantStatus, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return opFail('Loja não encontrada.');
    if (tenant.status === status) return { ok: true };

    const previous = tenant.status;
    tenant.status = status;
    const action = status === 'suspended' ? 'LOJA_SUSPENSA'
      : status === 'cancelled' ? 'LOJA_CANCELADA'
      : !isTenantOperational(previous) ? 'LOJA_REATIVADA'
      : 'LOJA_SITUACAO_ALTERADA';
    this.addAuditLog({
      tenant_id: tenantId, user_id: superAdminId, user_role: 'super_admin',
      action, module: 'Super Admin', record_id: tenantId,
      details: { loja: tenant.trade_name, de: previous, para: status }
    });
    if (this.isRealMode) void pushTenant(tenant, superAdminId);
    return { ok: true };
  }

  updateTenantPlan(
    tenantId: string,
    plan: { plan: TenantPlan; plan_start_date?: string; plan_due_date?: string },
    superAdminId: string
  ): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return opFail('Loja não encontrada.');
    if (plan.plan_start_date && plan.plan_due_date && plan.plan_due_date < plan.plan_start_date) {
      return opFail('A data de vencimento não pode ser anterior à data de início.');
    }
    const previous = tenant.plan;
    Object.assign(tenant, plan);
    this.addAuditLog({
      tenant_id: tenantId, user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_PLANO_ALTERADO', module: 'Super Admin', record_id: tenantId,
      details: { de: previous, para: plan.plan, inicio: plan.plan_start_date, vencimento: plan.plan_due_date }
    });
    if (this.isRealMode) void pushTenant(tenant, superAdminId);
    return { ok: true };
  }

  updateTenantFeatures(tenantId: string, features: TenantFeatures, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    if (!this.tenants.some(t => t.id === tenantId)) return opFail('Loja não encontrada.');
    this.tenantSettings[tenantId] = { ...this.tenantSettings[tenantId], ...features };
    this.addAuditLog({
      tenant_id: tenantId, user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_CONFIGURACOES_ALTERADAS', module: 'Super Admin', record_id: tenantId,
      details: { ...features }
    });
    if (this.isRealMode) void pushSettings(tenantId, this.tenantSettings[tenantId]);
    return { ok: true };
  }

  /** Registra (ou substitui) o modelo de documento da loja. O arquivo já foi gravado por lib/tenantDocuments. */
  saveTenantDocument(doc: TenantDocument, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    if (!this.tenants.some(t => t.id === doc.tenant_id)) return opFail('Loja não encontrada.');
    this.tenantDocuments = [
      ...this.tenantDocuments.filter(d => !(d.tenant_id === doc.tenant_id && d.type === doc.type)),
      doc
    ];
    this.addAuditLog({
      tenant_id: doc.tenant_id, user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_DOCUMENTO_ENVIADO', module: 'Super Admin', record_id: doc.id,
      details: { tipo: doc.type, arquivo: doc.file_name, campos_reconhecidos: doc.fields_matched }
    });
    if (this.isRealMode) void pushDocument(doc, superAdminId);
    return { ok: true };
  }

  removeTenantDocument(tenantId: string, type: TenantDocumentType, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const doc = this.getTenantDocument(tenantId, type);
    if (!doc) return { ok: true };
    this.tenantDocuments = this.tenantDocuments.filter(d => d !== doc);
    this.addAuditLog({
      tenant_id: tenantId, user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_DOCUMENTO_REMOVIDO', module: 'Super Admin', record_id: doc.id,
      details: { tipo: type, arquivo: doc.file_name }
    });
    if (this.isRealMode) void removeDocument(tenantId, type);
    return { ok: true };
  }

  /**
   * Exclui a loja e seus usuários. Lojas com movimentações não são excluídas (suspenda ou cancele).
   * No modo real a exclusão é feita antes no servidor (lib/adminApi) e isto apenas atualiza a tela.
   */
  deleteTenant(tenantId: string, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return opFail('Loja não encontrada.');

    const hasData = [
      this.devices, this.sales, this.customers, this.suppliers, this.accessories, this.gifts,
      this.serviceOrders, this.expenses, this.tradeIns
    ].some(list => (list as { tenant_id?: string }[]).some(row => row.tenant_id === tenantId));
    if (hasData) {
      return opFail('Esta loja já tem movimentações registradas (estoque, vendas ou clientes) e não pode ser excluída. Suspenda ou cancele a loja.');
    }

    const users = this.profiles.filter(p => p.tenant_id === tenantId).length;
    this.tenants = this.tenants.filter(t => t.id !== tenantId);
    this.profiles = this.profiles.filter(p => p.tenant_id !== tenantId);
    this.tenantDocuments = this.tenantDocuments.filter(d => d.tenant_id !== tenantId);
    this.goals = this.goals.filter(g => g.tenant_id !== tenantId);
    delete this.themes[tenantId];
    delete this.tenantSettings[tenantId];
    this.addAuditLog({
      user_id: superAdminId, user_role: 'super_admin',
      action: 'LOJA_EXCLUIDA', module: 'Super Admin', record_id: tenantId,
      details: { loja: tenant.trade_name, cnpj: tenant.cnpj, usuarios_removidos: users }
    });
    this.saveToStorage();
    return { ok: true };
  }

  setUserActive(userId: string, active: boolean, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const user = this.profiles.find(p => p.id === userId);
    if (!user) return opFail('Usuário não encontrado.');
    user.is_active = active;
    this.addAuditLog({
      tenant_id: user.tenant_id || undefined, user_id: superAdminId, user_role: 'super_admin',
      action: active ? 'USUARIO_REATIVADO_SUPERADMIN' : 'USUARIO_DESATIVADO_SUPERADMIN',
      module: 'Super Admin Usuários', record_id: user.id,
      details: { usuario: user.full_name, email: user.email, ativo: active }
    });
    return { ok: true };
  }

  /** Registra a redefinição de senha. A nova senha nunca passa pelo estado local. */
  registerPasswordReset(userId: string, superAdminId: string): OpResult {
    const denied = this.superAdminOnly(superAdminId);
    if (denied) return opFail(denied);
    const user = this.profiles.find(p => p.id === userId);
    if (!user) return opFail('Usuário não encontrado.');
    this.addAuditLog({
      tenant_id: user.tenant_id || undefined, user_id: superAdminId, user_role: 'super_admin',
      action: 'SENHA_REDEFINIDA_SUPERADMIN', module: 'Super Admin Usuários', record_id: user.id,
      details: { usuario: user.full_name, email: user.email }
    });
    return { ok: true };
  }

  registerAccess(userId: string) {
    const user = this.profiles.find(p => p.id === userId);
    if (!user) return;
    user.last_access_at = new Date().toISOString();
    this.saveToStorage();
  }

  // Sessão de Suporte do Super Admin
  startSupportSession(superAdminId: string, tenantId: string, reason: string): SupportSession {
    const session: SupportSession = {
      id: 'sup-sess-' + Date.now(),
      super_admin_id: superAdminId,
      target_tenant_id: tenantId,
      started_at: new Date().toISOString(),
      reason
    };
    this.supportSessions.unshift(session);
    this.addAuditLog({
      tenant_id: tenantId,
      user_id: superAdminId,
      user_role: 'super_admin',
      action: 'SESSAO_SUPORTE_INICIADA',
      module: 'Super Admin',
      record_id: session.id,
      details: { motivo: reason, tenant_alvo: tenantId }
    });
    this.saveToStorage();
    return session;
  }

  endSupportSession(sessionId: string): void {
    const sess = this.supportSessions.find(s => s.id === sessionId);
    if (sess) {
      sess.ended_at = new Date().toISOString();
      this.addAuditLog({
        tenant_id: sess.target_tenant_id,
        user_id: sess.super_admin_id,
        user_role: 'super_admin',
        action: 'SESSAO_SUPORTE_ENCERRADA',
        module: 'Super Admin',
        record_id: sessionId
      });
      this.saveToStorage();
    }
  }

  // Personalização Visual (EXCLUSIVA SUPER ADMIN)
  updateTenantTheme(theme: TenantTheme, superAdminId: string): void {
    this.themes[theme.tenant_id] = theme;
    this.addAuditLog({
      tenant_id: theme.tenant_id,
      user_id: superAdminId,
      user_role: 'super_admin',
      action: 'TEMA_VISUAL_PERSONALIZADO',
      module: 'Personalização Visual',
      record_id: theme.id,
      details: {
        cor_primaria: theme.primary_color,
        cor_secundaria: theme.secondary_color,
        cor_destaque: theme.accent_color,
        logo: Boolean(theme.logo_url),
        nome_exibido: theme.display_name,
        modo: theme.theme_mode
      }
    });
    this.saveToStorage();
    if (this.isRealMode) void pushTheme(theme);
  }

  // Restaurar Identidade Visual Padrão da Loja Selecionada
  resetTenantTheme(tenantId: string, superAdminId: string): TenantTheme {
    const tenant = this.tenants.find(t => t.id === tenantId);
    const defaultTheme: TenantTheme = {
      id: 'theme-' + tenantId,
      tenant_id: tenantId,
      logo_url: undefined,
      display_name: tenant?.trade_name || 'Loja',
      primary_color: '#1845E8',
      secondary_color: '#0B0F17',
      accent_color: '#3B82F6',
      theme_mode: 'light',
      dashboard_style: 'reference',
      pdf_header_style: 'standard'
    };
    this.themes[tenantId] = defaultTheme;
    this.addAuditLog({
      tenant_id: tenantId,
      user_id: superAdminId,
      user_role: 'super_admin',
      action: 'TEMA_VISUAL_RESTAURADO_PADRAO',
      module: 'Personalização Visual',
      record_id: tenantId,
      details: {
        loja: tenant?.trade_name,
        mensagem: 'Identidade visual restaurada para os padrões oficiais.'
      }
    });
    this.saveToStorage();
    if (this.isRealMode) void pushTheme(defaultTheme);
    return defaultTheme;
  }
}

export const store = new ControlphoneStore();
