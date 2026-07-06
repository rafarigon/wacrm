-- ============================================================
-- 023_leads.sql — Leads imobiliários (personalização RR)
--
-- Funil de leads independente dos deals: cards com imóvel de
-- interesse, score quente/morno/frio e visita agendada.
-- Escopo por conta seguindo o padrão da migração 017
-- (is_account_member).
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  imovel TEXT,
  origem TEXT,
  score INTEGER NOT NULL DEFAULT 100 CHECK (score BETWEEN 0 AND 100),
  etapa TEXT NOT NULL DEFAULT 'novo'
    CHECK (etapa IN ('novo', 'atendimento', 'visita', 'proposta', 'vendido', 'perdido')),
  data_visita TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_account_etapa ON leads(account_id, etapa);
CREATE INDEX IF NOT EXISTS idx_leads_account_created ON leads(account_id, created_at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_select ON leads FOR SELECT USING (is_account_member(account_id));
CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY leads_update ON leads FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY leads_delete ON leads FOR DELETE USING (is_account_member(account_id, 'agent'));
