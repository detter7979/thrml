-- Phase A: meta_executions table for Meta Ads Agent
-- Already applied via Supabase MCP for some environments; this file exists for repo-local migration tracker consistency.
-- NOTE: `attempt` defaults to 0 to match the app (initial insert before first Meta try).

CREATE TABLE IF NOT EXISTS meta_executions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                TEXT NOT NULL CHECK (source IN ('approved_recommendation', 'launch_creative', 'manual')),
  recommendation_id     UUID REFERENCES recommendations(id) ON DELETE SET NULL,
  variant_id            UUID,
  kind                  TEXT NOT NULL CHECK (kind IN (
    'pause_campaign','pause_ad_set','pause_ad',
    'kill_campaign','kill_ad_set','kill_ad',
    'adjust_campaign_budget','adjust_ad_set_budget',
    'create_ad_creative','attach_creative_to_adset','launch_ad',
    'duplicate_ad_set','create_lookalike'
  )),
  target_campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  target_ad_set_id      UUID REFERENCES ad_sets(id) ON DELETE SET NULL,
  target_ad_id          UUID REFERENCES ads(id) ON DELETE SET NULL,
  meta_campaign_id      TEXT,
  meta_adset_id         TEXT,
  meta_ad_id            TEXT,
  request_payload       JSONB NOT NULL,
  response_payload      JSONB,
  http_status           INT,
  status                TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'retrying')),
  attempt               INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  next_retry_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_executions_status_started ON meta_executions(status, started_at);
CREATE INDEX IF NOT EXISTS idx_meta_executions_recommendation ON meta_executions(recommendation_id) WHERE recommendation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_executions_target_campaign ON meta_executions(target_campaign_id, started_at DESC) WHERE target_campaign_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_executions_active_rec
  ON meta_executions(recommendation_id)
  WHERE recommendation_id IS NOT NULL
    AND status IN ('pending', 'in_progress', 'success');

ALTER TABLE meta_executions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_all_meta_executions ON meta_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY admin_select_meta_executions ON meta_executions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
