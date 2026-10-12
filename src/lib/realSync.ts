// ============================================================================
// CONTROLPHONE — GRAVAÇÃO NO BANCO DAS ALTERAÇÕES DE LOJA (MODO REAL)
// Usado pelo store depois de aplicar a alteração na tela. As regras de
// segurança do banco só aceitam estas gravações do Super Administrador.
// Em caso de falha, avisa e pede para recarregar: o banco é a fonte da verdade.
// ============================================================================

import { supabase } from './supabase';
import { Customer, Supplier, Tenant, TenantDocument, TenantDocumentType, TenantSettings, TenantTheme } from '../types';

const orNull = <T>(v: T | undefined | null | ''): T | null => (v === undefined || v === null || v === '' ? null : v);

function done(what: string, error: { message: string } | null) {
  if (!error) return;
  console.error(`Falha ao salvar ${what}:`, error.message);
  window.alert(`Não foi possível salvar ${what} no servidor. Recarregue a página e tente de novo.`);
}

export async function pushTenant(tenant: Tenant, userId: string) {
  const { error } = await supabase
    .from('tenants')
    .update({
      name: tenant.name,
      trade_name: tenant.trade_name,
      cnpj: orNull(tenant.cnpj),
      state_registration: orNull(tenant.state_registration),
      email: tenant.email,
      phone: tenant.phone,
      whatsapp: orNull(tenant.whatsapp),
      website: orNull(tenant.website),
      address_zipcode: orNull(tenant.address_zipcode),
      address_street: orNull(tenant.address_street),
      address_number: orNull(tenant.address_number),
      address_complement: orNull(tenant.address_complement),
      address_neighborhood: orNull(tenant.address_neighborhood),
      address_city: orNull(tenant.address_city),
      address_state: orNull(tenant.address_state),
      status: tenant.status,
      plan: orNull(tenant.plan),
      plan_start_date: orNull(tenant.plan_start_date),
      plan_due_date: orNull(tenant.plan_due_date),
      updated_at: new Date().toISOString()
    })
    .eq('id', tenant.id);
  if (error) return done('os dados da loja', error);

  const notes = await supabase.from('tenant_internal_notes').upsert({
    tenant_id: tenant.id,
    notes: tenant.internal_notes || '',
    updated_by: userId,
    updated_at: new Date().toISOString()
  });
  done('as observações da loja', notes.error);
}

export async function pushTheme(theme: TenantTheme) {
  const { error } = await supabase.from('tenant_themes').upsert(
    {
      tenant_id: theme.tenant_id,
      display_name: theme.display_name,
      logo_url: orNull(theme.logo_url),
      logo_compact_url: orNull(theme.logo_compact_url),
      favicon_url: orNull(theme.favicon_url),
      primary_color: theme.primary_color,
      secondary_color: theme.secondary_color,
      accent_color: orNull(theme.accent_color),
      button_color: orNull(theme.button_color),
      sidebar_color: orNull(theme.sidebar_color),
      card_color: orNull(theme.card_color),
      action_button_color: orNull(theme.action_button_color),
      theme_mode: theme.theme_mode,
      dashboard_style: theme.dashboard_style,
      pdf_header_style: theme.pdf_header_style,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'tenant_id' }
  );
  done('a identidade visual', error);
}

export async function pushSettings(tenantId: string, settings: TenantSettings) {
  const { warranty_days: _fixed, ...features } = settings; // a garantia é fixa em 90 dias
  const { error } = await supabase
    .from('tenant_settings')
    .upsert({ tenant_id: tenantId, ...features, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  done('as configurações da loja', error);
}

export async function pushDocument(doc: TenantDocument, userId: string) {
  if (!doc.storage_path) return; // sem arquivo no servidor não há o que registrar
  const { error } = await supabase.from('tenant_documents').upsert(
    {
      tenant_id: doc.tenant_id,
      type: doc.type,
      file_name: doc.file_name,
      size: doc.size,
      storage_path: doc.storage_path,
      fields_total: doc.fields_total,
      fields_matched: doc.fields_matched,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString()
    },
    { onConflict: 'tenant_id,type' }
  );
  done('o modelo de documento', error);
}

export async function removeDocument(tenantId: string, type: TenantDocumentType) {
  const { error } = await supabase.from('tenant_documents').delete().eq('tenant_id', tenantId).eq('type', type);
  done('a remoção do modelo', error);
}

// ---------------------------------------------------------------------------
// CLIENTES E FORNECEDORES (primeiros cadastros operacionais gravados no banco)
// Devolvem true/false em vez de avisar: quem chama decide o que fazer com a
// falha (o store mantém o registro na fila de envio e tenta de novo depois).
// ---------------------------------------------------------------------------

export const customerRow = (c: Customer) => ({
  id: c.id,
  tenant_id: c.tenant_id,
  name: c.name,
  phone: c.phone,
  whatsapp: orNull(c.whatsapp),
  email: orNull(c.email),
  cpf: orNull(c.cpf),
  birth_date: orNull(c.birth_date),
  address: orNull(c.address),
  notes: orNull(c.notes),
  created_at: c.created_at,
  updated_at: new Date().toISOString()
});

export const supplierRow = (s: Supplier) => ({
  id: s.id,
  tenant_id: s.tenant_id,
  name: s.name,
  company_name: orNull(s.company_name),
  phone: s.phone,
  whatsapp: orNull(s.whatsapp),
  email: orNull(s.email),
  cpf_cnpj: orNull(s.cpf_cnpj),
  address: orNull(s.address),
  notes: orNull(s.notes),
  created_at: s.created_at
});

const report = (what: string, error: { message: string } | null): boolean => {
  if (error) console.error(`Falha ao salvar ${what}:`, error.message);
  return !error;
};

export async function pushCustomers(customers: Customer[]): Promise<boolean> {
  if (customers.length === 0) return true;
  const { error } = await supabase.from('customers').upsert(customers.map(customerRow), { onConflict: 'id' });
  return report('clientes', error);
}

export async function pushSuppliers(suppliers: Supplier[]): Promise<boolean> {
  if (suppliers.length === 0) return true;
  const { error } = await supabase.from('suppliers').upsert(suppliers.map(supplierRow), { onConflict: 'id' });
  return report('fornecedores', error);
}

export async function removeSupplierRemote(supplierId: string): Promise<boolean> {
  const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
  return report('a exclusão do fornecedor', error);
}
