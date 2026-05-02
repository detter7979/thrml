-- Creative briefs (versioned, refinable)
CREATE TABLE IF NOT EXISTS public.creative_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_brief_id uuid REFERENCES public.creative_briefs(id),
  version int DEFAULT 1,
  trigger_type text NOT NULL,
  trigger_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','briefed','generating','variations_ready','approved','rejected','launched','done')),
  hypothesis text,
  target_audience text,
  hook text,
  format text DEFAULT '1x1',
  visual_direction text,
  copy_primary text,
  copy_headline text,
  copy_subtext text,
  cta text DEFAULT 'Book Now',
  reference_image_urls text[] DEFAULT '{}',
  rationale text,
  campaign_short_name text,
  success_criteria jsonb DEFAULT '{}'::jsonb,
  created_by text DEFAULT 'agent',
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

ALTER TABLE public.creative_briefs
  ADD COLUMN IF NOT EXISTS parent_brief_id uuid REFERENCES public.creative_briefs(id),
  ADD COLUMN IF NOT EXISTS version int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hypothesis text,
  ADD COLUMN IF NOT EXISTS copy_subtext text,
  ADD COLUMN IF NOT EXISTS campaign_short_name text,
  ADD COLUMN IF NOT EXISTS success_criteria jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE public.creative_briefs
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN trigger_data SET DEFAULT '{}'::jsonb,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN format SET DEFAULT '1x1',
  ALTER COLUMN cta SET DEFAULT 'Book Now',
  ALTER COLUMN reference_image_urls SET DEFAULT '{}',
  ALTER COLUMN success_criteria SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_by SET DEFAULT 'agent',
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creative_briefs_status_check'
      AND conrelid = 'public.creative_briefs'::regclass
  ) THEN
    ALTER TABLE public.creative_briefs
      ADD CONSTRAINT creative_briefs_status_check
      CHECK (status IN ('pending','briefed','generating','variations_ready','approved','rejected','launched','done')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_creative_briefs_status ON public.creative_briefs(status);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_campaign ON public.creative_briefs(campaign_short_name);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_created ON public.creative_briefs(created_at DESC);

-- Creative assets (the rendered files)
CREATE TABLE IF NOT EXISTS public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('image','video','reference')),
  generation_tool text NOT NULL CHECK (generation_tool IN ('imagen','replicate_mj','gemini','midjourney','higgsfield','manual')),
  variation_index int DEFAULT 1,
  variation_label text,
  format text,
  gcs_path text NOT NULL,
  gcs_url text,
  meta_image_hash text,
  meta_video_id text,
  meta_creative_id text,
  meta_ad_id text,
  meta_adset_id text,
  status text DEFAULT 'generated'
    CHECK (status IN ('generated','approved','rejected','launched','paused')),
  performance_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  launched_at timestamptz
);

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS variation_label text,
  ADD COLUMN IF NOT EXISTS format text,
  ADD COLUMN IF NOT EXISTS meta_image_hash text,
  ADD COLUMN IF NOT EXISTS meta_creative_id text;

ALTER TABLE public.creative_assets
  ALTER COLUMN variation_index SET DEFAULT 1,
  ALTER COLUMN status SET DEFAULT 'generated',
  ALTER COLUMN performance_data SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creative_assets_asset_type_check'
      AND conrelid = 'public.creative_assets'::regclass
  ) THEN
    ALTER TABLE public.creative_assets
      ADD CONSTRAINT creative_assets_asset_type_check
      CHECK (asset_type IN ('image','video','reference')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creative_assets_generation_tool_check'
      AND conrelid = 'public.creative_assets'::regclass
  ) THEN
    ALTER TABLE public.creative_assets
      ADD CONSTRAINT creative_assets_generation_tool_check
      CHECK (generation_tool IN ('imagen','replicate_mj','gemini','midjourney','higgsfield','manual')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creative_assets_status_check'
      AND conrelid = 'public.creative_assets'::regclass
  ) THEN
    ALTER TABLE public.creative_assets
      ADD CONSTRAINT creative_assets_status_check
      CHECK (status IN ('generated','approved','rejected','launched','paused')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_creative_assets_brief ON public.creative_assets(brief_id);
CREATE INDEX IF NOT EXISTS idx_creative_assets_status ON public.creative_assets(status);
CREATE INDEX IF NOT EXISTS idx_creative_assets_generator ON public.creative_assets(generation_tool);

-- Competitor intel (Phase 3 prep - create now, populate later)
CREATE TABLE IF NOT EXISTS public.competitor_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_name text NOT NULL,
  observation_type text CHECK (observation_type IN ('ad','landing','feature','pricing','social')),
  source_url text,
  summary text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  screenshot_gcs_url text,
  captured_at timestamptz DEFAULT now()
);

-- Weekly test plans (Phase 4 prep)
CREATE TABLE IF NOT EXISTS public.weekly_test_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_starting date NOT NULL UNIQUE,
  hypothesis text,
  audiences_to_test jsonb DEFAULT '[]'::jsonb,
  creatives_to_test jsonb DEFAULT '[]'::jsonb,
  success_criteria jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'planned',
  results_summary text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

-- RLS - service role full access, authenticated users read
ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_test_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_briefs" ON public.creative_briefs;
CREATE POLICY "service_role_all_briefs" ON public.creative_briefs
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_assets" ON public.creative_assets;
CREATE POLICY "service_role_all_assets" ON public.creative_assets
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_intel" ON public.competitor_intel;
CREATE POLICY "service_role_all_intel" ON public.competitor_intel
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_plans" ON public.weekly_test_plans;
CREATE POLICY "service_role_all_plans" ON public.weekly_test_plans
  FOR ALL USING (auth.role() = 'service_role');
