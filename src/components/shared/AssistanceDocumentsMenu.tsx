// ============================================================================
// CONTROLPHONE — BOTÃO "DOCUMENTOS DA ASSISTÊNCIA"
// ============================================================================

import React from 'react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { ServiceOrder } from '../../types';
import { DocumentsMenu } from './DocumentsMenu';
import { getAssistanceDocumentItems } from '../../lib/pdf/assistanceDocuments';

interface AssistanceDocumentsMenuProps {
  os: ServiceOrder;
  placement?: 'up' | 'down';
  variant?: 'primary' | 'neutral';
  onNotice?: (message: string) => void;
}

export const AssistanceDocumentsMenu: React.FC<AssistanceDocumentsMenuProps> = ({ os, placement = 'up', variant = 'neutral', onNotice }) => {
  const { currentTenant, currentTheme, currentUser } = useAuth();
  if (!currentTenant) return null;

  return (
    <DocumentsMenu
      label="Documentos da Assistência"
      items={getAssistanceDocumentItems({ os, tenant: currentTenant, theme: currentTheme })}
      placement={placement}
      variant={variant}
      onNotice={onNotice}
      onSent={(item, channel) => {
        store.addAuditLog({
          tenant_id: os.tenant_id, user_id: currentUser.id, user_role: currentUser.role,
          action: 'DOCUMENTO_ENVIADO', module: 'Assistência Técnica', record_id: os.id,
          details: { documento: item.label, canal: channel, os_numero: os.os_number }
        });
        store.saveToStorage();
      }}
    />
  );
};
