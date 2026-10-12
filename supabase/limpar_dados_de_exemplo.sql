-- ============================================================================
-- CONTROLPHONE — REMOVE OS DADOS DE EXEMPLO DO BANCO (supabase/seed.sql)
--
-- O seed criou duas lojas fictícias e alguns perfis SEM login, entre eles um
-- "Super Admin" de exemplo. Enquanto ele existir, o sistema entende que já foi
-- instalado e não mostra a tela "Configuração inicial".
--
-- Este script apaga SOMENTE as linhas de exemplo, identificadas pelos ids fixos
-- do seed. Se alguma delas tiver dados ligados (o que não deveria acontecer),
-- o banco recusa a exclusão e nada é alterado.
-- Rode uma vez no SQL Editor, com o arquivo inteiro.
-- ============================================================================

BEGIN;

-- Perfis de exemplo (o Super Admin fictício e as equipes das duas lojas)
DELETE FROM profiles
WHERE id = '00000000-0000-0000-0000-000000000001'
   OR tenant_id IN (
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222'
   );

-- Lojas de exemplo (tema, configurações e documentos saem junto)
DELETE FROM tenants
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

COMMIT;

-- Conferência: as duas consultas devem voltar vazias
SELECT id, role, full_name, email FROM profiles;
SELECT id, trade_name FROM tenants;
