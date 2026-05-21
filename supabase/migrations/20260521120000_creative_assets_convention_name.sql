-- Convention-compliant ad names for Meta push and reporting parser.

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS convention_name text;

CREATE INDEX IF NOT EXISTS idx_creative_assets_convention_name
  ON public.creative_assets(convention_name)
  WHERE convention_name IS NOT NULL;

COMMENT ON COLUMN public.creative_assets.convention_name IS
  'Full thrml convention ad name (e.g. T05_A_pov_earnings_Video_15s_list_now). Built at job creation, used as Meta ad name on push.';

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS ad_name text;

COMMENT ON COLUMN public.render_jobs.ad_name IS
  'Pre-computed convention ad name. Worker copies this to creative_assets.convention_name on completion.';
