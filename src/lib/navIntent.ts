// ============================================================================
// CONTROLPHONE — NAVEGAÇÃO ENTRE MÓDULOS COM DADOS PRÉ-PREENCHIDOS
// Ex.: da garantia para a Assistência Técnica já com cliente, modelo e IMEI.
// A tela de destino consome a intenção uma única vez ao abrir.
// ============================================================================

export type NavIntent =
  | { type: 'new-external-assistance'; customerId: string; brand: string; model: string; storage?: string; color?: string; imei: string; warrantyId?: string; saleId?: string }
  | { type: 'new-return'; saleId: string; saleItemId?: string }
  | { type: 'view-sale'; saleNumber: number }
  | { type: 'view-customer'; customerId: string }
  | { type: 'view-warranty'; warrantyId: string };

const NAV_EVENT = 'controlphone:navigate';
const pending = new Map<string, NavIntent>();

export const navigateTo = (view: string, intent?: NavIntent) => {
  if (intent) pending.set(view, intent);
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { view } }));
};

export const consumeIntent = <T extends NavIntent['type']>(
  view: string,
  type: T
): Extract<NavIntent, { type: T }> | undefined => {
  const intent = pending.get(view);
  if (!intent || intent.type !== type) return undefined;
  pending.delete(view);
  return intent as Extract<NavIntent, { type: T }>;
};

export const onNavigate = (handler: (view: string) => void) => {
  const listener = (e: Event) => handler((e as CustomEvent<{ view: string }>).detail.view);
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
};
