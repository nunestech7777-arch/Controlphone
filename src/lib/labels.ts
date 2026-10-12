// ============================================================================
// CONTROLPHONE — RÓTULOS COMUNS (STATUS DE OS E FORMAS DE PAGAMENTO)
// ============================================================================

import { OSStatus, PaymentMethod } from '../types';

export const OS_STATUS_LABELS: Record<OSStatus, string> = {
  waiting_diagnosis: 'Aguardando diagnóstico',
  in_diagnosis: 'Em diagnóstico',
  quote_pending_admin: 'Aguardando orçamento',
  quote_ready: 'Orçamento enviado',
  waiting_client_approval: 'Aguardando aprovação',
  approved: 'Orçamento aprovado',
  in_maintenance: 'Em manutenção',
  waiting_parts: 'Aguardando peça',
  repair_completed: 'Manutenção concluída',
  ready_for_pickup: 'Aguardando retirada',
  delivered: 'Entregue',
  rejected: 'Orçamento recusado',
  cancelled: 'Cancelada'
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  trade_in_credit: 'Aparelho recebido no upgrade',
  store_credit: 'Crédito da loja',
  other: 'Outro'
};

export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
