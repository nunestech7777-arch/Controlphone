// ============================================================================
// CONTROLPHONE — DADOS DO SISTEMA PARA OS MODELOS DE DOCUMENTO DA LOJA
// Monta os valores de cada chave de TEMPLATE_FIELDS (lib/tenantDocuments) a
// partir da venda ou da ordem de serviço. Chave sem dado fica em branco.
// ============================================================================

import { store } from '../store';
import { Customer, PaymentMethod, Sale, ServiceOrder, Tenant, TenantTheme } from '../../types';
import { TemplateValues } from '../tenantDocuments';
import { saleRevenue } from '../saleFinance';

const brl = (v?: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateBR = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const localDateBR = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  trade_in_credit: 'Aparelho na troca',
  store_credit: 'Crédito da loja',
  other: 'Outro'
};

const describeDevice = (d?: { brand: string; model: string; storage_capacity?: string; color?: string }) =>
  d ? [d.brand, d.model, d.storage_capacity, d.color].filter(Boolean).join(' ') : '';

const tenantValues = (tenant: Tenant, theme?: TenantTheme): TemplateValues => {
  const street = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const address = [street, tenant.address_complement, tenant.address_neighborhood].filter(Boolean).join(' - ');
  const city = [tenant.address_city, tenant.address_state].filter(Boolean).join('/');
  return {
    loja_nome: theme?.display_name || tenant.trade_name,
    loja_razao_social: tenant.name,
    loja_cnpj: tenant.cnpj || '',
    loja_ie: tenant.state_registration || '',
    loja_telefone: tenant.phone,
    loja_whatsapp: tenant.whatsapp || '',
    loja_email: tenant.email,
    loja_site: tenant.website || '',
    loja_endereco: [address, city].filter(Boolean).join(' - '),
    loja_cidade: tenant.address_city || '',
    loja_estado: tenant.address_state || '',
    loja_cep: tenant.address_zipcode || '',
    data_emissao: new Date().toLocaleDateString('pt-BR')
  };
};

const customerValues = (customer?: Customer): TemplateValues => ({
  cliente_nome: customer?.name || '',
  cliente_cpf: customer?.cpf || '',
  cliente_telefone: customer?.whatsapp || customer?.phone || '',
  cliente_email: customer?.email || '',
  cliente_endereco: customer?.address || ''
});

export function saleTemplateValues(
  sale: Sale,
  tenant: Tenant,
  theme: TenantTheme | undefined,
  customer: Customer | undefined,
  sellerName: string
): TemplateValues {
  const items = (sale.items || []).filter(it => !it.returned_at);
  const deviceItem = items.find(it => it.item_type === 'device' && it.device_id);
  const device = deviceItem ? store.devices.find(d => d.id === deviceItem.device_id) : undefined;
  const warranty = deviceItem ? store.warranties.find(w => w.sale_item_id === deviceItem.id) : undefined;
  const tradeIn = sale.trade_in_id ? store.tradeIns.find(t => t.id === sale.trade_in_id) : undefined;
  const received = tradeIn ? store.devices.find(d => d.id === tradeIn.received_device_id) : undefined;

  const itemLines = items.map(it => {
    if (it.item_type === 'device') {
      const d = store.devices.find(x => x.id === it.device_id);
      return `${describeDevice(d) || 'Aparelho'}${d ? ` - IMEI ${d.imei}` : ''} - ${brl(it.total_price)}`;
    }
    const acc = store.accessories.find(a => a.id === it.accessory_id);
    return `${it.quantity}x ${acc?.name || 'Acessório'} - ${brl(it.total_price)}`;
  });

  return {
    ...tenantValues(tenant, theme),
    ...customerValues(customer),
    vendedor_nome: sellerName,
    venda_numero: String(sale.sale_number),
    venda_data: localDateBR(sale.created_at),
    venda_itens: itemLines.join('\n'),
    venda_subtotal: brl(sale.subtotal),
    venda_desconto: brl(sale.discount_amount),
    venda_total: brl(saleRevenue(sale)), // tudo o que foi cobrado (inclui juros da maquininha)
    venda_pagamento: (sale.payments || [])
      .map(p => `${PAYMENT_LABELS[p.payment_method] || p.payment_method}${p.installments > 1 ? ` ${p.installments}x` : ''}: ${brl(p.amount)}`)
      .join(' | '),
    aparelho_descricao: describeDevice(device),
    aparelho_marca: device?.brand || '',
    aparelho_modelo: device?.model || '',
    aparelho_armazenamento: device?.storage_capacity || '',
    aparelho_cor: device?.color || '',
    aparelho_imei: device?.imei || '',
    aparelho_bateria: device?.battery_health ? `${device.battery_health}%` : '',
    aparelho_valor: deviceItem ? brl(deviceItem.total_price) : '',
    garantia_dias: warranty ? String(warranty.warranty_days) : '',
    garantia_inicio: dateBR(warranty?.start_date),
    garantia_fim: dateBR(warranty?.end_date),
    usado_descricao: describeDevice(received),
    usado_imei: received?.imei || '',
    usado_avaliacao: tradeIn ? brl(tradeIn.appraisal_value) : '',
    upgrade_diferenca: tradeIn ? brl(Math.max(0, Number(tradeIn.difference_amount))) : ''
  };
}

export function serviceOrderTemplateValues(os: ServiceOrder, tenant: Tenant, theme?: TenantTheme): TemplateValues {
  const customer = store.customers.find(c => c.id === os.customer_id);
  const technician = store.profiles.find(p => p.id === os.assigned_technician_id);
  const quote = os.client_quote_amount ?? ((Number(os.quote_service_amount) || 0) + (Number(os.quote_parts_amount) || 0));

  return {
    ...tenantValues(tenant, theme),
    ...customerValues(customer),
    vendedor_nome: store.profiles.find(p => p.id === os.intake_seller_id)?.full_name || '',
    tecnico_nome: technician?.full_name || '',
    os_numero: String(os.os_number),
    os_data: localDateBR(os.entered_at || os.created_at),
    os_defeito: os.reported_defect || '',
    os_estado_aparelho: os.physical_condition || '',
    os_diagnostico: os.problem_found || os.technician_diagnosis || '',
    os_servico: os.quote_service_description || os.service_needed || os.service_performed || '',
    os_pecas: os.quote_parts_description || os.parts_used || '',
    os_valor: quote ? brl(quote) : '',
    os_prazo: dateBR(os.quote_deadline || os.estimated_delivery_date),
    aparelho_descricao: describeDevice({
      brand: os.device_brand, model: os.device_model, storage_capacity: os.device_storage, color: os.device_color
    }),
    aparelho_marca: os.device_brand,
    aparelho_modelo: os.device_model,
    aparelho_armazenamento: os.device_storage || '',
    aparelho_cor: os.device_color || '',
    aparelho_imei: os.imei || ''
  };
}
