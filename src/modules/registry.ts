// ============================================================================
// CONTROLPHONE — REGISTRO DE MÓDULOS
//
// Fonte única de verdade sobre quais módulos existem. Módulos padrão ficam
// sempre ativos; módulos opcionais são contratados pelo Super Admin por loja
// (coluna correspondente em tenant_settings / TenantFeatures).
//
// Para criar um módulo novo (ex.: marketplace, locação):
//   1. adicione a coluna em tenant_settings e a chave em TenantFeatures
//      (types/index.ts, tenantSetup.ts: FEATURE_OPTIONS e DEFAULT_FEATURES);
//   2. registre-o aqui (OPTIONAL_MODULES) com as telas (views) que ele possui;
//   3. crie a pasta src/modules/<modulo> com as telas carregadas por
//      React.lazy em App.tsx e as próprias tabelas no banco.
// Menu, rotas e consultas respeitam o registro; nenhum outro módulo muda.
// ============================================================================

import { TenantFeatures } from '../types';

export type CoreModuleId =
  | 'dashboard' | 'sales' | 'inventory' | 'customers' | 'suppliers' | 'financial' | 'settings';
export type OptionalModuleId = 'assistance' | 'wholesale';
export type ModuleId = CoreModuleId | OptionalModuleId;

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  /** Opcional: só existe com a flag ligada pelo Super Admin */
  optional: boolean;
  /** Chave em TenantFeatures que contrata o módulo (somente opcionais) */
  featureKey?: keyof TenantFeatures;
  /** Telas (ids de view) que pertencem ao módulo; ficam inacessíveis com o módulo desligado */
  views: string[];
}

export const CORE_MODULES: ModuleDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Painel geral da loja.', optional: false, views: [] },
  { id: 'sales', label: 'Vendas', description: 'Vendas, upgrades, garantias e trocas.', optional: false, views: [] },
  { id: 'inventory', label: 'Estoque', description: 'Aparelhos, acessórios e brindes.', optional: false, views: [] },
  { id: 'customers', label: 'Clientes (CRM)', description: 'Cadastro e relacionamento.', optional: false, views: [] },
  { id: 'suppliers', label: 'Fornecedores', description: 'Cadastro e histórico de compras.', optional: false, views: [] },
  { id: 'financial', label: 'Financeiro', description: 'Receitas, despesas e lucro.', optional: false, views: [] },
  { id: 'settings', label: 'Configurações', description: 'Equipe, identidade e documentos.', optional: false, views: [] }
];

export const OPTIONAL_MODULES: ModuleDefinition[] = [
  {
    id: 'assistance', label: 'Assistência Técnica', optional: true, featureKey: 'assistance',
    description: 'Ordens de serviço, orçamentos e bancada.',
    views: ['admin-service-orders', 'seller-os-intake']
  },
  {
    id: 'wholesale', label: 'Atacado', optional: true, featureKey: 'wholesale',
    description: 'Estoque, clientes, vendas e financeiro próprios, separados do varejo.',
    views: ['wholesale']
  }
];

export const ALL_MODULES: ModuleDefinition[] = [...CORE_MODULES, ...OPTIONAL_MODULES];

export const isModuleEnabled = (moduleId: OptionalModuleId, features: TenantFeatures): boolean => {
  const def = OPTIONAL_MODULES.find(m => m.id === moduleId);
  return Boolean(def?.featureKey && features[def.featureKey]);
};

/** Módulo opcional dono de uma tela, se houver */
export const moduleOfView = (view: string): ModuleDefinition | undefined =>
  OPTIONAL_MODULES.find(m => m.views.includes(view));

/** A tela pode ser aberta? Telas de módulos opcionais exigem o módulo ligado. */
export const isViewAvailable = (view: string, features: TenantFeatures): boolean => {
  const owner = moduleOfView(view);
  return !owner || Boolean(owner.featureKey && features[owner.featureKey]);
};
