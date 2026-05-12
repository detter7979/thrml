-- =============================================================================
-- thrml — Paid Media System of Record
-- Supabase Postgres DDL · v3 · 2026-05
-- =============================================================================
-- Run order:
--   1) extensions + enums
--   2) reference tables (rules_config)
--   3) core tables (campaigns -> ad_sets -> ads)
--   4) performance tables
--   5) agent tables (recommendations, actions_log)
--   6) indexes
--   7) RLS policies
--   8) triggers
--   9) realtime publication
--   10) seed rules_config defaults
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- name search

-- -----------------------------------------------------------------------------
-- 2. Enums (one source of truth for every controlled vocabulary in the namer)
-- -----------------------------------------------------------------------------
CREATE TYPE platform_t      AS ENUM ('META','GOOG','SNAP','TIKTOK','LINKEDIN');
CREATE TYPE persona_t       AS ENUM ('host','guest');
CREATE TYPE service_t       AS ENUM ('sauna','hottub','coldplunge','multi','all');
CREATE TYPE phase_t         AS ENUM ('P1','P2','P3');
CREATE TYPE funnel_t        AS ENUM ('PROSP','LAL','RT','CRM');
CREATE TYPE event_t         AS ENUM ('BH','HO','NL','ACT','VC','IC','PUR');
CREATE TYPE status_t        AS ENUM ('DRAFT','TEST','SCALE','PAUSED','KILLED','ARCHIVED');
CREATE TYPE budget_mode_t   AS ENUM ('ABO','CBO');
CREATE TYPE placement_t     AS ENUM ('FEED-STORIES','REELS','ADV-PLUS','SEARCH','PMAX','DEMAND-GEN');
CREATE TYPE ad_format_t     AS ENUM ('Static_9x16','Static_1x1','Static_4x5','Video_15s','Video_30s','Carousel','UGC','RSA');
CREATE TYPE angle_t         AS ENUM ('income','community','idle_space','thermal','social_proof','urgency','sensory','ease');
CREATE TYPE cta_t           AS ENUM ('list_now','learn_more','get_started','see_how','book_now','explore','join_waitlist');
CREATE TYPE rec_status_t    AS ENUM ('PENDING','APPROVED','REJECTED','MODIFIED','EXECUTED','FAILED','EXPIRED');
CREATE TYPE rec_kind_t      AS ENUM (
  'CREATE_CAMPAIGN','CREATE_AD_SET','CREATE_AD',
  'ADJUST_BUDGET','PAUSE_AD','PAUSE_AD_SET','PAUSE_CAMPAIGN',
  'KILL_AD','KILL_AD_SET','KILL_CAMPAIGN',
  'ADVANCE_PHASE','LAUNCH_LAL','LAUNCH_TEST','PROMOTE_WINNER',
  'GENERATE_CREATIVE','EXPAND_GEO'
);
CREATE TYPE actor_t         AS ENUM ('HUMAN','EVALUATOR_AGENT','META_AGENT','CREATIVE_AGENT','REPORTING_AGENT','SYSTEM');

-- -----------------------------------------------------------------------------
-- 3. rules_config — single tunable file the evaluator agent reads on every run
-- -----------------------------------------------------------------------------
CREATE TABLE rules_config (
  id              BIGSERIAL PRIMARY KEY,
  scope           TEXT NOT NULL,                  -- e.g. 'global','META.host.sauna','META.guest.*'
  rule_key        TEXT NOT NULL,                  -- e.g. 'min_spend_per_variant'
  rule_value      JSONB NOT NULL,                 -- typed value (number, string, object)
  description     TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      TEXT,
  UNIQUE (scope, rule_key)
);

COMMENT ON TABLE rules_config IS
  'Thresholds, kill rules, auto-approve floors. Evaluator agent reads this every run. Edit in dashboard or directly.';

-- -----------------------------------------------------------------------------
-- 4. campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE campaigns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          TEXT UNIQUE,                  -- C001, C002... maintained for migration period
  name               TEXT NOT NULL UNIQUE,         -- generated, e.g. META_host_sauna_SEA_P1_PROSP_BH_2026W19
  platform           platform_t NOT NULL,
  persona            persona_t  NOT NULL,
  service            service_t  NOT NULL,
  geo                TEXT NOT NULL,                -- SEA | PDX | AUS | LAX | NYC | DEN | US | MULTI (free text for flexibility)
  phase              phase_t    NOT NULL,
  funnel             funnel_t   NOT NULL,
  event              event_t    NOT NULL,
  launch_week        TEXT NOT NULL,                -- 2026W19 format
  version            TEXT DEFAULT '',              -- empty for v1, 'v2' / 'v3' for relaunches
  status             status_t NOT NULL DEFAULT 'DRAFT',
  daily_budget_usd   NUMERIC(10,2),
  budget_mode        budget_mode_t NOT NULL DEFAULT 'ABO',
  priority           TEXT,                         -- '1','2','3','★' — kept flexible
  platform_campaign_id TEXT,                       -- Meta campaign_id once created
  notes              TEXT,
  created_by         actor_t NOT NULL DEFAULT 'HUMAN',
  approved_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  launched_at        TIMESTAMPTZ,
  paused_at          TIMESTAMPTZ,
  killed_at          TIMESTAMPTZ
);

COMMENT ON COLUMN campaigns.name IS
  'Generated per naming convention v3. App enforces format; DB enforces uniqueness.';

-- -----------------------------------------------------------------------------
-- 5. ad_sets
-- -----------------------------------------------------------------------------
CREATE TABLE ad_sets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          TEXT UNIQUE,                  -- AS001, AS002...
  campaign_id        UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name               TEXT NOT NULL UNIQUE,
  audience_src       TEXT NOT NULL,                -- int-sauna, lal1-host, rt-checkout14d... kept flexible
  placement          placement_t NOT NULL,
  audience_details   TEXT,                         -- free text describing the actual interest stack
  conv_event         event_t NOT NULL,
  budget_weight_pct  NUMERIC(5,2),                 -- 0-100
  status             status_t NOT NULL DEFAULT 'DRAFT',
  platform_adset_id  TEXT,
  notes              TEXT,
  created_by         actor_t NOT NULL DEFAULT 'HUMAN',
  approved_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  launched_at        TIMESTAMPTZ,
  paused_at          TIMESTAMPTZ,
  killed_at          TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 6. ads
-- -----------------------------------------------------------------------------
CREATE TABLE ads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          TEXT UNIQUE,                  -- AD001, AD002...
  ad_set_id          UUID NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  campaign_id        UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name               TEXT NOT NULL UNIQUE,
  test_id            TEXT NOT NULL,                -- T01, T02 — increments per batch
  variant            TEXT NOT NULL CHECK (variant IN ('A','B','C')),
  angle              angle_t NOT NULL,
  format             ad_format_t NOT NULL,
  cta                cta_t NOT NULL,
  hook_copy          TEXT,                         -- first ~3 words of headline
  status             status_t NOT NULL DEFAULT 'DRAFT',
  gcs_path           TEXT,                         -- gs://thrml-creative/[campaign_id]/[ad_set_id]/[test_id]/[ad_id]/[variant].png
  platform_ad_id     TEXT,
  conv_event         event_t NOT NULL,
  is_winner          BOOLEAN NOT NULL DEFAULT FALSE,
  parent_test_id     TEXT,                         -- for tracking winner-carry forward
  notes              TEXT,
  created_by         actor_t NOT NULL DEFAULT 'HUMAN',
  approved_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  launched_at        TIMESTAMPTZ,
  paused_at          TIMESTAMPTZ,
  killed_at          TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 7. performance_daily — raw daily pull from Meta Insights API
-- -----------------------------------------------------------------------------
CREATE TABLE performance_daily (
  id                 BIGSERIAL PRIMARY KEY,
  date               DATE NOT NULL,
  level              TEXT NOT NULL CHECK (level IN ('campaign','ad_set','ad')),
  entity_id          UUID NOT NULL,                -- FK by convention to one of the above
  platform_entity_id TEXT,                         -- Meta's ID for sanity-check joins
  impressions        BIGINT,
  reach              BIGINT,
  clicks             BIGINT,
  link_clicks        BIGINT,
  spend_usd          NUMERIC(12,2),
  cpm                NUMERIC(10,4),
  cpc                NUMERIC(10,4),
  ctr                NUMERIC(8,5),
  frequency          NUMERIC(8,3),
  conversions        BIGINT,
  conv_event         event_t,
  cost_per_conv      NUMERIC(10,4),
  revenue_usd        NUMERIC(12,2),                -- when measurable
  raw_payload        JSONB,                        -- full Meta response for audit
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, level, entity_id, conv_event)
);

COMMENT ON TABLE performance_daily IS
  'Raw daily pull from Meta Insights API. One row per entity per day per conversion event. Never updated, only inserted.';

-- -----------------------------------------------------------------------------
-- 8. performance_master — cleaned/joined view with derived metrics
-- (materialized for speed; refreshed by reporting agent after daily ingest)
-- -----------------------------------------------------------------------------
CREATE TABLE performance_master (
  id                 BIGSERIAL PRIMARY KEY,
  date               DATE NOT NULL,
  campaign_id        UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_set_id          UUID REFERENCES ad_sets(id) ON DELETE CASCADE,
  ad_id              UUID REFERENCES ads(id) ON DELETE CASCADE,
  level              TEXT NOT NULL CHECK (level IN ('campaign','ad_set','ad')),
  -- denormalized for fast reporting
  platform           platform_t NOT NULL,
  persona            persona_t  NOT NULL,
  service            service_t  NOT NULL,
  geo                TEXT NOT NULL,
  phase              phase_t    NOT NULL,
  funnel             funnel_t   NOT NULL,
  conv_event         event_t,
  launch_week        TEXT NOT NULL,
  -- metrics
  impressions        BIGINT,
  clicks             BIGINT,
  link_clicks        BIGINT,
  spend_usd          NUMERIC(12,2),
  cpm                NUMERIC(10,4),
  cpc                NUMERIC(10,4),
  ctr                NUMERIC(8,5),
  conversions        BIGINT,
  cost_per_conv      NUMERIC(10,4),
  revenue_usd        NUMERIC(12,2),
  -- derived for thrml-specific KPIs
  signup_count       BIGINT,                       -- BH events
  onboard_count      BIGINT,                       -- HO
  listing_count      BIGINT,                       -- NL
  activation_count   BIGINT,                       -- ACT
  cac_signup         NUMERIC(10,4),
  cac_activation     NUMERIC(10,4),
  payback_days       NUMERIC(8,2),                 -- when revenue data present
  cohort_week        TEXT,                         -- ISO week of first event for this entity
  -- meta
  refreshed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, level, campaign_id, ad_set_id, ad_id, conv_event)
);

-- -----------------------------------------------------------------------------
-- 9. recommendations — proposals from agents (or humans) awaiting action
-- -----------------------------------------------------------------------------
CREATE TABLE recommendations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind               rec_kind_t NOT NULL,
  status             rec_status_t NOT NULL DEFAULT 'PENDING',
  proposed_by        actor_t NOT NULL,
  -- targeting: what entity does this act on (nullable for CREATE actions)
  target_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  target_ad_set_id   UUID REFERENCES ad_sets(id) ON DELETE SET NULL,
  target_ad_id       UUID REFERENCES ads(id) ON DELETE SET NULL,
  -- payload: agent-readable proposal (e.g. new daily_budget, full campaign object, etc.)
  payload            JSONB NOT NULL,
  -- evidence: what data drove this proposal
  evidence           JSONB,                        -- metrics snapshot + rule that fired
  rationale          TEXT,                         -- human-readable explanation
  confidence         NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  -- approval workflow
  auto_approve_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by        TEXT,
  approved_at        TIMESTAMPTZ,
  rejected_reason    TEXT,
  modified_payload   JSONB,                        -- if you tweak before approve
  -- execution
  executed_by_action_id UUID,                      -- pointer to actions_log row
  expires_at         TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '72 hours'),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE recommendations IS
  'Approval queue. Every proposed change to live campaigns lands here first. Real-time subscribed by dashboard.';

-- -----------------------------------------------------------------------------
-- 10. actions_log — immutable record of every executed action
-- -----------------------------------------------------------------------------
CREATE TABLE actions_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id  UUID REFERENCES recommendations(id) ON DELETE SET NULL,
  kind               rec_kind_t NOT NULL,
  executed_by        actor_t NOT NULL,
  target_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  target_ad_set_id   UUID REFERENCES ad_sets(id) ON DELETE SET NULL,
  target_ad_id       UUID REFERENCES ads(id) ON DELETE SET NULL,
  payload            JSONB NOT NULL,                -- what was actually sent
  platform_request   JSONB,                         -- Meta API request body
  platform_response  JSONB,                         -- Meta API response
  success            BOOLEAN NOT NULL,
  error_message      TEXT,
  executed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE actions_log IS
  'Append-only audit trail. Never updated. Every agent action and every approved human action is logged here.';

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX idx_campaigns_status        ON campaigns(status) WHERE status NOT IN ('KILLED','ARCHIVED');
CREATE INDEX idx_campaigns_platform_persona_service ON campaigns(platform, persona, service);
CREATE INDEX idx_campaigns_launch_week   ON campaigns(launch_week);
CREATE INDEX idx_campaigns_name_trgm     ON campaigns USING gin(name gin_trgm_ops);

CREATE INDEX idx_ad_sets_campaign        ON ad_sets(campaign_id);
CREATE INDEX idx_ad_sets_status          ON ad_sets(status) WHERE status NOT IN ('KILLED','ARCHIVED');

CREATE INDEX idx_ads_ad_set              ON ads(ad_set_id);
CREATE INDEX idx_ads_campaign            ON ads(campaign_id);
CREATE INDEX idx_ads_test                ON ads(test_id);
CREATE INDEX idx_ads_status              ON ads(status) WHERE status NOT IN ('KILLED','ARCHIVED');

CREATE INDEX idx_perf_daily_date         ON performance_daily(date DESC);
CREATE INDEX idx_perf_daily_entity       ON performance_daily(entity_id, date DESC);

CREATE INDEX idx_perf_master_date        ON performance_master(date DESC);
CREATE INDEX idx_perf_master_campaign    ON performance_master(campaign_id, date DESC);
CREATE INDEX idx_perf_master_service_geo ON performance_master(service, geo, date DESC);

CREATE INDEX idx_recs_status             ON recommendations(status) WHERE status = 'PENDING';
CREATE INDEX idx_recs_created            ON recommendations(created_at DESC);
CREATE INDEX idx_recs_target_campaign    ON recommendations(target_campaign_id);

CREATE INDEX idx_actions_executed        ON actions_log(executed_at DESC);
CREATE INDEX idx_actions_target_campaign ON actions_log(target_campaign_id);

-- =============================================================================
-- Triggers — updated_at maintenance
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaigns_updated       BEFORE UPDATE ON campaigns       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ad_sets_updated         BEFORE UPDATE ON ad_sets         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ads_updated             BEFORE UPDATE ON ads             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recs_updated            BEFORE UPDATE ON recommendations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rules_updated           BEFORE UPDATE ON rules_config    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- RLS — service roles for each agent + owner full access
-- =============================================================================
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_sets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules_config       ENABLE ROW LEVEL SECURITY;

-- Default deny. Service role (used by agents + dashboard backend) bypasses RLS.
-- For end-user access (read-only dashboard views), add specific policies later.

CREATE POLICY service_role_all_campaigns          ON campaigns          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ad_sets            ON ad_sets            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ads                ON ads                FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_perf_daily         ON performance_daily  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_perf_master        ON performance_master FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_recs               ON recommendations    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_actions            ON actions_log        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_rules              ON rules_config       FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Realtime publication — dashboard subscribes for live approval queue
-- =============================================================================
-- Run once in Supabase SQL editor:
ALTER PUBLICATION supabase_realtime ADD TABLE recommendations;
ALTER PUBLICATION supabase_realtime ADD TABLE actions_log;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- =============================================================================
-- Seed: rules_config defaults (matches namer v3 thresholds)
-- =============================================================================
INSERT INTO rules_config (scope, rule_key, rule_value, description) VALUES
  ('global','approval_mode',                  '"ALL_REQUIRE_APPROVAL"',                'Start strict. Loosen by changing to AUTO_APPROVE_LOW_STAKES later.'),
  ('global','min_spend_per_variant_usd',      '20',                                    'Each A/B variant needs >= $20/day to escape learning'),
  ('global','min_test_window_days',           '7',                                     'Do not call winners before day 5; default window 7d'),
  ('global','kill_clicks_threshold',          '200',                                   'Kill underperformer after 200+ clicks each'),
  ('global','kill_confidence_threshold',      '0.95',                                  '95% confidence required to call a winner'),
  ('global','frequency_saturation_cap',       '3.0',                                   'Move from RT to PROSP when ad set frequency > 3'),
  ('global','rec_expiry_hours',               '72',                                    'Pending recommendations auto-expire after 72h'),
  ('phase.P1','exit_events_per_week',         '50',                                    'P1 -> P2: needs >= 50 BH events/wk for 2+ weeks'),
  ('phase.P2','exit_events_per_week',         '50',                                    'P2 -> P3: needs >= 50 HO events/wk for 2+ weeks'),
  ('phase.P3','advantage_plus_floor_events',  '100',                                   'P3: enable Advantage+ after 100+ NL events'),
  ('host.*','primary_kpi',                    '"cac_activation"',                      'North Star metric for host campaigns'),
  ('guest.*','primary_kpi',                   '"cac_purchase"',                        'North Star metric for guest campaigns'),
  ('host.*','target_cac_activation_usd',      '150',                                   'Target CAC per activated host (initial assumption — tune)'),
  ('guest.*','target_cac_purchase_usd',       '35',                                    'Target CAC per first booking — tune from cohort data'),
  ('host.*','target_payback_days',            '90',                                    'CAC payback target for hosts (revenue is back-loaded)'),
  ('guest.*','target_payback_days',           '30',                                    'CAC payback target for guests'),
  ('host.sauna.SEA','seed_metro',             'true',                                  'Seattle is the seed metro for sauna; gates expansion'),
  ('auto_approve','budget_change_under_usd',  '20',                                    'When approval_mode flips to AUTO_APPROVE_LOW_STAKES: auto-approve budget tweaks under $20/day on TEST campaigns'),
  ('auto_approve','pause_under_perf_threshold','{"cpc_multiplier":3,"clicks_min":100}','Auto-pause an ad whose CPC is >3x the ad set median after 100+ clicks'),
  ('auto_approve','requires_human_kinds',     '["CREATE_CAMPAIGN","KILL_CAMPAIGN","EXPAND_GEO","PROMOTE_WINNER"]', 'These action kinds always require human approval regardless of autonomy level');

-- =============================================================================
-- Convenience views for the dashboard
-- =============================================================================
CREATE OR REPLACE VIEW v_pending_recs AS
SELECT
  r.id, r.kind, r.proposed_by, r.confidence, r.rationale,
  r.created_at, r.expires_at,
  c.name AS campaign_name, c.service, c.geo, c.phase,
  a.name AS ad_set_name,
  ad.name AS ad_name,
  r.payload, r.evidence
FROM recommendations r
LEFT JOIN campaigns c  ON r.target_campaign_id = c.id
LEFT JOIN ad_sets a    ON r.target_ad_set_id   = a.id
LEFT JOIN ads ad       ON r.target_ad_id       = ad.id
WHERE r.status = 'PENDING'
ORDER BY r.created_at DESC;

CREATE OR REPLACE VIEW v_active_campaigns AS
SELECT
  c.*,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status NOT IN ('KILLED','ARCHIVED','PAUSED')) AS active_ad_sets,
  COUNT(DISTINCT ad.id) FILTER (WHERE ad.status NOT IN ('KILLED','ARCHIVED','PAUSED')) AS active_ads
FROM campaigns c
LEFT JOIN ad_sets a ON a.campaign_id = c.id
LEFT JOIN ads ad    ON ad.campaign_id = c.id
WHERE c.status IN ('TEST','SCALE')
GROUP BY c.id;

-- end of DDL --
