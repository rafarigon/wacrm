-- 025: WAHA as an alternative WhatsApp provider.
--
-- The CRM was built on the official Meta Cloud API. WAHA
-- (github.com/devlikeapro/waha) is a self-hosted gateway that speaks
-- the consumer protocol instead — no Meta business verification, no
-- per-conversation pricing, connected by scanning a QR code.
--
-- One whatsapp_config row still equals one connected number. For
-- provider='waha' rows:
--   * access_token       → the WAHA API key (encrypted, same as Meta's token)
--   * waha_url           → base URL of the WAHA instance (https://waha.example.com)
--   * waha_session       → WAHA session name; the waha-webhook route uses it
--                          to resolve the owning account, so it must be unique
--   * phone_number_id    → unused by WAHA sends; keep the connected number's
--                          digits there so existing UNIQUE + lookups stay sane
--
-- Templates and interactive buttons/lists remain Meta-only (they are
-- Cloud API concepts); the senders reject them for WAHA configs.

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'waha')),
  ADD COLUMN IF NOT EXISTS waha_url text,
  ADD COLUMN IF NOT EXISTS waha_session text;

-- The waha-webhook route maps an incoming event to exactly one account
-- via the session name — duplicates would make tenancy ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_waha_session_key
  ON whatsapp_config (waha_session)
  WHERE waha_session IS NOT NULL;
