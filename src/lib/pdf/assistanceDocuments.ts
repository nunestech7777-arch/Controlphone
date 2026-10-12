// ============================================================================
// CONTROLPHONE — DOCUMENTOS DA ASSISTÊNCIA (CATÁLOGO ÚNICO)
// Para adicionar um novo documento, inclua um item em ASSISTANCE_DOCUMENTS:
// o botão "Documentos da Assistência" passa a listá-lo automaticamente.
// ============================================================================

import { store } from '../store';
import { ServiceOrder, Tenant, TenantTheme } from '../../types';
import { BuiltDocument, DocumentAction, DocumentMenuItem, runBuiltDocumentAction } from './documentActions';
import { buildQuotePDF, buildServiceOrderPDF } from './serviceOrderPDF';
import { serviceOrderTemplateValues } from './templateValues';

export interface AssistanceDocContext {
  os: ServiceOrder;
  tenant: Tenant;
  theme?: TenantTheme;
}

interface AssistanceDocumentDef {
  id: string;
  label: string;
  description: string;
  comingSoon?: boolean;
  isAvailable: (ctx: AssistanceDocContext) => boolean;
  build?: (ctx: AssistanceDocContext) => BuiltDocument;
  message?: (ctx: AssistanceDocContext, storeName: string, customerName: string) => string;
}

const hasQuote = (os: ServiceOrder) =>
  Boolean(os.client_quote_amount || os.quote_service_amount || os.quote_parts_amount);

export const ASSISTANCE_DOCUMENTS: AssistanceDocumentDef[] = [
  {
    id: 'service-order',
    label: 'Ordem de Serviço',
    description: 'Dados do aparelho, checklist de entrada, orçamento e termos',
    isAvailable: () => true,
    build: (ctx) => getServiceOrderDocument(ctx),
    message: (ctx, storeName, customerName) =>
      `Olá ${customerName}, segue a Ordem de Serviço nº ${ctx.os.os_number} do seu ${ctx.os.device_brand} ${ctx.os.device_model} na ${storeName}.`
  },
  {
    id: 'quote',
    label: 'Orçamento',
    description: 'Serviço, peças, valor total e prazo para aprovação',
    isAvailable: (ctx) => hasQuote(ctx.os),
    build: (ctx) => buildQuotePDF(ctx.os, ctx.tenant, ctx.theme),
    message: (ctx, storeName, customerName) =>
      `Olá ${customerName}, segue o orçamento da Ordem de Serviço nº ${ctx.os.os_number} (${ctx.os.device_brand} ${ctx.os.device_model}) na ${storeName}. O serviço só é iniciado após a sua aprovação.`
  },
  {
    id: 'delivery-receipt',
    label: 'Comprovante de Entrega',
    description: 'Em breve',
    comingSoon: true,
    isAvailable: () => true
  }
];

// Ordem de Serviço: usa o modelo próprio da loja quando ele existe e é preenchível
export function getServiceOrderDocument(ctx: AssistanceDocContext): BuiltDocument {
  return {
    ...buildServiceOrderPDF([ctx.os], ctx.tenant, ctx.theme),
    template: {
      tenantId: ctx.tenant.id,
      type: 'service_order',
      values: serviceOrderTemplateValues(ctx.os, ctx.tenant, ctx.theme)
    }
  };
}

/** Itens prontos para o menu de documentos (com as ações já ligadas à OS). */
export const getAssistanceDocumentItems = (ctx: AssistanceDocContext): DocumentMenuItem[] => {
  const customer = store.customers.find(c => c.id === ctx.os.customer_id);
  const storeName = ctx.theme?.display_name || ctx.tenant.trade_name;

  return ASSISTANCE_DOCUMENTS.filter(d => d.isAvailable(ctx)).map(def => ({
    id: def.id,
    label: def.label,
    description: def.description,
    comingSoon: def.comingSoon,
    run: def.build
      ? (action: DocumentAction) =>
          runBuiltDocumentAction(def.build!(ctx), action, {
            text: def.message ? def.message(ctx, storeName, customer?.name || '') : '',
            subject: `${def.label} nº ${ctx.os.os_number}`,
            phone: customer?.whatsapp || customer?.phone,
            email: customer?.email
          })
      : undefined
  }));
};
