// ============================================================================
// CONTROLPHONE — GRAVAÇÃO NO BANCO (MODO REAL)
// Usado pelo store depois de aplicar a alteração na tela.
//   - Dados da loja (identidade visual, configurações, modelos): só o Super
//     Administrador grava; em caso de falha, avisa e pede para recarregar.
//   - Cadastros (clientes, fornecedores, estoque): uma linha por registro.
//   - Módulos operacionais (vendas, assistência, financeiro...): um documento
//     por registro na tabela tenant_records.
// ============================================================================

import { supabase } from './supabase';
import { Accessory, AuditLog, Customer, Device, Gift, Supplier, SupplierPurchase, SupportSession, Tenant, TenantDocument, TenantDocumentType, TenantSettings, TenantTheme } from '../types';

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

const uuidOrNull = (v?: string) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export const deviceRow = (d: Device) => ({
  id: d.id,
  tenant_id: d.tenant_id,
  imei: d.imei,
  brand: d.brand,
  model: d.model,
  storage_capacity: d.storage_capacity,
  color: d.color || '',
  battery_health: d.battery_health ?? null,
  physical_condition_notes: orNull(d.physical_condition_notes),
  supplier_id: uuidOrNull(d.supplier_id),
  origin: d.origin,
  origin_trade_in_id: uuidOrNull(d.origin_trade_in_id),
  acquisition_cost: money(d.acquisition_cost),
  accumulated_repair_cost: money(d.accumulated_repair_cost),
  suggested_price: money(d.suggested_price),
  status: d.status,
  entry_date: d.entry_date,
  sold_at: orNull(d.sold_at),
  created_at: d.created_at,
  updated_at: new Date().toISOString()
});

export const accessoryRow = (a: Accessory) => ({
  id: a.id,
  tenant_id: a.tenant_id,
  name: a.name,
  category: a.category,
  barcode: orNull(a.barcode),
  quantity: Math.trunc(Number(a.quantity) || 0),
  unit_cost: money(a.unit_cost),
  sale_price: money(a.sale_price),
  supplier_id: uuidOrNull(a.supplier_id),
  created_at: a.created_at,
  updated_at: new Date().toISOString()
});

export const giftRow = (g: Gift) => ({
  id: g.id,
  tenant_id: g.tenant_id,
  name: g.name,
  category: g.category,
  quantity: Math.trunc(Number(g.quantity) || 0),
  unit_cost: money(g.unit_cost),
  notes: orNull(g.notes),
  supplier_id: uuidOrNull(g.supplier_id),
  created_at: g.created_at
});

export const supplierPurchaseRow = (p: SupplierPurchase) => ({
  id: p.id,
  tenant_id: p.tenant_id,
  supplier_id: p.supplier_id,
  item_type: p.item_type,
  item_id: p.item_id,
  description: (p.description || '').slice(0, 255),
  quantity: Math.trunc(Number(p.quantity) || 0),
  unit_cost: money(p.unit_cost),
  total_cost: money(p.total_cost),
  purchased_at: p.purchased_at,
  created_at: p.created_at
});

export type SyncTable = 'customers' | 'suppliers' | 'devices' | 'accessories' | 'gifts' | 'supplierPurchases';

export const SYNC_TABLES: Record<SyncTable, { table: string; row: (rec: never) => Record<string, unknown> }> = {
  customers: { table: 'customers', row: customerRow as never },
  suppliers: { table: 'suppliers', row: supplierRow as never },
  devices: { table: 'devices', row: deviceRow as never },
  accessories: { table: 'accessories', row: accessoryRow as never },
  gifts: { table: 'gifts', row: giftRow as never },
  supplierPurchases: { table: 'supplier_purchases', row: supplierPurchaseRow as never }
};

/** Grava (cria ou atualiza) os registros. Devolve false se o servidor recusou ou não respondeu. */
export async function pushRows(kind: SyncTable, records: unknown[]): Promise<boolean> {
  if (records.length === 0) return true;
  const { table, row } = SYNC_TABLES[kind];
  const rows = records.map(r => row(r as never));
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (!error) return true;

  // Perfil que pode alterar mas não cadastrar (ex.: vendedor baixando a quantidade de um acessório):
  // o banco recusa o "criar ou atualizar"; tenta só atualizar, linha a linha.
  if (error.code === '42501') {
    const results = await Promise.all(
      rows.map(r => supabase.from(table).update(r).eq('id', String(r.id)).select('id'))
    );
    const allUpdated = results.every(res => !res.error && (res.data || []).length === 1);
    if (allUpdated) return true;
  }
  console.error(`Falha ao salvar ${table}:`, error.message);
  return false;
}

export async function deleteRows(kind: SyncTable, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { table } = SYNC_TABLES[kind];
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) console.error(`Falha ao excluir em ${table}:`, error.message);
  return !error;
}

// ---------------------------------------------------------------------------
// MÓDULOS OPERACIONAIS (tabela tenant_records, migration 17)
// Cada registro do store sobe como documento JSON. Quem grava e a data da
// gravação são preenchidos pelo servidor.
// ---------------------------------------------------------------------------

export const RECORDS_TABLE = 'tenant_records';

export type DocRow = { id: string; tenant_id: string; json: string };

/** Grava (cria ou atualiza) documentos de um tipo. Devolve false se o servidor recusou ou não respondeu. */
export async function pushDocs(kind: string, docs: DocRow[]): Promise<boolean> {
  if (docs.length === 0) return true;
  const rows = docs.map(d => ({ tenant_id: d.tenant_id, kind, id: d.id, data: JSON.parse(d.json) }));
  if (kind === 'auditLogs') return insertOnly(kind, rows);
  // Todo perfil que altera um destes tipos também pode incluir, então o "criar ou atualizar" basta
  // (não precisa da segunda tentativa só com atualização usada em pushRows).
  const { error } = await supabase.from(RECORDS_TABLE).upsert(rows, { onConflict: 'tenant_id,kind,id' });
  if (error) console.error(`Falha ao salvar ${kind}:`, error.message);
  return !error;
}

// O histórico de atividades só aceita inclusão, e vendedor e técnico não podem lê-lo. O "incluir
// ignorando repetidos" do banco exige permissão de leitura e é recusado (42501) para eles; por isso
// vai como inclusão simples. Se algum registro do lote já tinha chegado (resposta perdida no envio
// anterior), o lote é refeito um a um e o repetido conta como enviado.
async function insertOnly(kind: string, rows: Record<string, unknown>[]): Promise<boolean> {
  const { error } = await supabase.from(RECORDS_TABLE).insert(rows);
  if (!error) return true;
  if (error.code === '23505') {
    const results = await Promise.all(rows.map(row => supabase.from(RECORDS_TABLE).insert(row)));
    const failed = results.find(res => res.error && res.error.code !== '23505');
    if (!failed) return true;
    console.error(`Falha ao salvar ${kind}:`, failed.error?.message);
    return false;
  }
  console.error(`Falha ao salvar ${kind}:`, error.message);
  return false;
}

/** Reserva no servidor os próximos números da loja (venda, OS ou solicitação). Devolve null se não conseguiu. */
export async function reserveNumbers(kind: string, count: number, tenantId: string): Promise<number[] | null> {
  const { data, error } = await supabase.rpc('reserve_record_numbers', { p_kind: kind, p_count: count, p_tenant_id: tenantId });
  if (error || !Array.isArray(data)) return null;
  return data.map(Number).filter(n => Number.isInteger(n) && n > 0);
}

// ---------------------------------------------------------------------------
// PAINEL DA PLATAFORMA (Super Admin): sessões de suporte e ações sem loja
// (tabelas support_sessions e audit_logs, regras na migration 18)
// ---------------------------------------------------------------------------

/** Grava a abertura ou o encerramento de uma sessão de suporte. 'gone' = a loja não existe mais. */
export async function pushSupportSession(session: SupportSession): Promise<'ok' | 'gone' | 'failed'> {
  const { error } = await supabase.from('support_sessions').upsert({
    id: session.id,
    super_admin_id: session.super_admin_id,
    target_tenant_id: session.target_tenant_id,
    started_at: session.started_at,
    ended_at: orNull(session.ended_at),
    reason: session.reason || 'Não informado'
  }, { onConflict: 'id' });
  if (!error) return 'ok';
  if (error.code === '23503') return 'gone';
  console.error('Falha ao salvar a sessão de suporte:', error.message);
  return 'failed';
}

const platformLogRow = (log: AuditLog) => ({
  id: log.id,
  tenant_id: null,
  user_id: orNull(log.user_id),
  user_email: orNull(log.user_email),
  user_role: orNull(log.user_role),
  action: (log.action || '').slice(0, 100),
  module: (log.module || '').slice(0, 100),
  record_id: orNull(log.record_id ? String(log.record_id).slice(0, 255) : undefined),
  details: log.details ?? null,
  created_at: log.created_at
});

/** Inclui no histórico do servidor as ações da plataforma sem loja. Registro que já chegou conta como enviado. */
export async function pushPlatformLogs(logs: AuditLog[]): Promise<boolean> {
  if (logs.length === 0) return true;
  const rows = logs.map(platformLogRow);
  const { error } = await supabase.from('audit_logs').insert(rows);
  if (!error) return true;
  if (error.code === '23505') {
    const results = await Promise.all(rows.map(row => supabase.from('audit_logs').insert(row)));
    const failed = results.find(res => res.error && res.error.code !== '23505');
    if (!failed) return true;
    console.error('Falha ao salvar o histórico da plataforma:', failed.error?.message);
    return false;
  }
  console.error('Falha ao salvar o histórico da plataforma:', error.message);
  return false;
}
