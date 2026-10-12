// ============================================================================
// CONTROLPHONE — BOTÃO "DOCUMENTOS DA VENDA"
// Monta a lista a partir do catálogo (lib/pdf/saleDocuments) e usa o menu genérico.
// ============================================================================

import React from 'react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Sale } from '../../types';
import { DocumentsMenu } from './DocumentsMenu';
import { DocumentMenuItem } from '../../lib/pdf/documentActions';
import { getAvailableDocuments, getSaleContext, runDocumentAction } from '../../lib/pdf/saleDocuments';

interface SaleDocumentsMenuProps {
  sale: Sale;
  placement?: 'up' | 'down';
  variant?: 'primary' | 'neutral';
  onNotice?: (message: string) => void;
}

export const SaleDocumentsMenu: React.FC<SaleDocumentsMenuProps> = ({ sale, placement = 'up', variant = 'neutral', onNotice }) => {
  const { currentTenant, currentTheme, currentUser } = useAuth();
  if (!currentTenant) return null;

  const ctx = getSaleContext(sale, currentTenant, currentTheme);
  const items: DocumentMenuItem[] = getAvailableDocuments(ctx).map(def => ({
    id: def.id,
    label: def.label,
    description: def.description,
    run: (action) => runDocumentAction(def, ctx, action)
  }));

  return (
    <DocumentsMenu
      label="Documentos da Venda"
      items={items}
      placement={placement}
      variant={variant}
      onNotice={onNotice}
      onSent={(item, channel) => {
        store.addAuditLog({
          tenant_id: sale.tenant_id, user_id: currentUser.id, user_role: currentUser.role,
          action: 'DOCUMENTO_ENVIADO', module: 'Vendas', record_id: sale.id,
          details: { documento: item.label, canal: channel, venda: sale.sale_number }
        });
        store.saveToStorage();
      }}
    />
  );
};
