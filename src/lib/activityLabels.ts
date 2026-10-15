// ============================================================================
// CONTROLPHONE — HISTÓRICO DE ATIVIDADES EM LINGUAGEM SIMPLES
// Os registros guardam códigos (ex.: VENDA_FINALIZADA) e detalhes técnicos para
// auditoria no banco. A tela mostra só quem fez, o que fez, em qual módulo e quando.
// ============================================================================

import { AuditLog, UserProfile } from '../types';

// O que foi feito, sempre como frase completa ("Realizou uma venda.")
const ACTION_LABELS: Record<string, string> = {
  // Vendas
  VENDA_FINALIZADA: 'Realizou uma venda.',
  VENDA_CONCLUIDA: 'Realizou uma venda.',
  VENDA_CANCELADA: 'Cancelou uma venda.',
  DOCUMENTO_ENVIADO: 'Enviou um documento ao cliente.',
  // Estoque
  ENTRADA_ESTOQUE: 'Deu entrada de um aparelho no estoque.',
  APARELHO_CADASTRADO: 'Cadastrou um aparelho.',
  APARELHO_EDITADO: 'Alterou um aparelho.',
  APARELHO_EXCLUIDO: 'Excluiu um aparelho.',
  APARELHO_INATIVADO: 'Inativou um aparelho.',
  APARELHO_TIPO_ALTERADO: 'Alterou o tipo de um aparelho (seminovo ou lacrado).',
  ACESSORIO_CADASTRADO: 'Cadastrou um acessório.',
  BRINDE_CADASTRADO: 'Cadastrou um brinde.',
  // Clientes e fornecedores
  CLIENTE_CADASTRADO: 'Cadastrou um cliente.',
  CLIENTE_EDITADO: 'Alterou um cliente.',
  FORNECEDOR_CADASTRADO: 'Cadastrou um fornecedor.',
  FORNECEDOR_EDITADO: 'Alterou um fornecedor.',
  FORNECEDOR_EXCLUIDO: 'Excluiu um fornecedor.',
  // Assistência técnica
  ASSISTENCIA_EXTERNA_ABERTA: 'Criou uma Ordem de Serviço.',
  ASSISTENCIA_INTERNA_ABERTA: 'Enviou um aparelho do estoque para a assistência.',
  DIAGNOSTICO_REGISTRADO: 'Registrou o diagnóstico de uma Ordem de Serviço.',
  ORCAMENTO_DEFINIDO: 'Definiu o orçamento de uma Ordem de Serviço.',
  ORCAMENTO_APROVADO: 'Registrou a aprovação de um orçamento.',
  ORCAMENTO_RECUSADO: 'Registrou a recusa de um orçamento.',
  MANUTENCAO_CONCLUIDA: 'Concluiu o reparo de um aparelho.',
  ASSISTENCIA_EXTERNA_CONCLUIDA: 'Concluiu uma Ordem de Serviço.',
  ASSISTENCIA_INTERNA_CONCLUIDA: 'Concluiu a manutenção de um aparelho do estoque.',
  APARELHO_ENTREGUE_RECEBIDO: 'Entregou um aparelho ao cliente.',
  APARELHO_DEVOLVIDO_SEM_REPARO: 'Devolveu um aparelho ao cliente sem reparo.',
  ASSISTENCIA_CANCELADA: 'Cancelou uma Ordem de Serviço.',
  // Trocas e devoluções
  TROCA_DEVOLUCAO_SOLICITADA: 'Abriu uma solicitação de troca ou devolução.',
  TROCA_DEVOLUCAO_STATUS: 'Atualizou uma solicitação de troca ou devolução.',
  TROCA_DEVOLUCAO_CONCLUIDA: 'Concluiu uma troca ou devolução.',
  // Financeiro
  DESPESA_LANCADA: 'Lançou uma despesa.',
  DESPESA_EDITADA: 'Alterou uma despesa.',
  DESPESA_MARCADA_COMO_PAGA: 'Marcou uma despesa como paga.',
  DESPESA_REVERTIDA_PARA_PENDENTE: 'Voltou uma despesa para pendente.',
  // Equipe
  FUNCIONARIO_CADASTRADO: 'Cadastrou um funcionário.',
  FUNCIONARIO_EDITADO: 'Alterou um funcionário.',
  FUNCIONARIO_DESATIVADO: 'Desativou um funcionário.',
  FUNCIONARIO_REATIVADO: 'Reativou um funcionário.',
  SENHA_REDEFINIDA: 'Redefiniu a senha de um funcionário.',
  META_ATUALIZADA: 'Atualizou a meta de um vendedor.',
  FOTO_DE_PERFIL_ATUALIZADA: 'Atualizou a foto de perfil.',
  FOTO_DE_PERFIL_REMOVIDA: 'Removeu a foto de perfil.',
  TEXTOS_COMPROVANTE_ALTERADOS: 'Alterou os textos dos comprovantes de venda.',
  // Atacado
  ATACADO_PERMISSAO_VENDEDOR: 'Alterou a permissão dos vendedores no atacado.',
  // Backups
  BACKUP_AUTOMATICO: 'Backup automático realizado.',
  BACKUP_CRIADO: 'Fez um backup.',
  BACKUP_DE_SEGURANCA: 'Backup de segurança realizado antes de uma restauração.',
  BACKUP_BAIXADO: 'Baixou um backup.',
  BACKUP_RESTAURADO: 'Restaurou um backup.',
  BACKUP_EXCLUIDO: 'Excluiu um backup.',
  // Plataforma (Super Admin)
  LOJA_CADASTRADA: 'Cadastrou uma loja.',
  LOJA_DADOS_ATUALIZADOS: 'Atualizou os dados de uma loja.',
  LOJA_CONFIGURACOES_ALTERADAS: 'Alterou as configurações de uma loja.',
  LOJA_PLANO_ALTERADO: 'Alterou o plano de uma loja.',
  LOJA_SITUACAO_ALTERADA: 'Alterou a situação de uma loja.',
  LOJA_SUSPENSA: 'Suspendeu uma loja.',
  LOJA_REATIVADA: 'Reativou uma loja.',
  LOJA_CANCELADA: 'Cancelou uma loja.',
  LOJA_EXCLUIDA: 'Excluiu uma loja.',
  LOJA_DOCUMENTO_ENVIADO: 'Enviou um modelo de documento da loja.',
  LOJA_DOCUMENTO_REMOVIDO: 'Removeu um modelo de documento da loja.',
  TEMA_VISUAL_PERSONALIZADO: 'Personalizou a identidade visual da loja.',
  TEMA_VISUAL_RESTAURADO_PADRAO: 'Restaurou a identidade visual padrão da loja.',
  SESSAO_SUPORTE_INICIADA: 'Iniciou uma sessão de suporte.',
  SESSAO_SUPORTE_ENCERRADA: 'Encerrou uma sessão de suporte.',
  USUARIO_DESATIVADO_SUPERADMIN: 'Desativou um usuário.',
  USUARIO_REATIVADO_SUPERADMIN: 'Reativou um usuário.',
  SENHA_REDEFINIDA_SUPERADMIN: 'Redefiniu a senha de um usuário.'
};

// Nome do módulo como aparece no menu
const MODULE_LABELS: Record<string, string> = {
  'Estoque Aparelhos': 'Estoque',
  'Estoque Acessórios': 'Estoque',
  Backup: 'Backups',
  'Super Admin': 'Gestão de Lojas',
  'Super Admin Usuários': 'Usuários da Plataforma'
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  seller: 'Vendedor',
  technician: 'Técnico'
};

/** Ação sem frase cadastrada: o código vira texto comum ("ALGO_FEITO" → "Algo feito."). */
function fromCode(code: string): string {
  const text = (code || '').replace(/_/g, ' ').trim().toLowerCase();
  if (!text) return 'Realizou uma ação.';
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export const activityText = (log: AuditLog) => ACTION_LABELS[log.action] || fromCode(log.action);

export const activityModule = (log: AuditLog) => MODULE_LABELS[log.module] || log.module || 'Sistema';

/** Quem fez: nome do usuário; sem cadastro conhecido, o perfil; ações automáticas aparecem como "Sistema". */
export function activityAuthor(log: AuditLog, profiles: UserProfile[]): string {
  if (!log.user_id || log.user_role === 'system') return 'Sistema';
  const profile = profiles.find(p => p.id === log.user_id);
  if (profile?.full_name) return profile.full_name;
  return ROLE_LABELS[log.user_role || ''] || 'Usuário';
}

/** "14/10/2026 às 15:48" */
export function activityWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}
