-- ============================================================
-- 024_leads_sync_portal_corretor.sql
--
-- Leads sincronizados do Portal do Corretor (banco da RR,
-- nwxesykrptzfdrrjtfou): o trigger corretor_sync_wacrm de lá faz
-- upsert via PostgREST usando external_id como chave (Prefer:
-- resolution=merge-duplicates + on_conflict=external_id).
-- Sincronização em MÃO ÚNICA — nada deste banco volta ao portal.
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_id UUID UNIQUE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS corretor_nome TEXT;
