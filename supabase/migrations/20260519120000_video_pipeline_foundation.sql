-- Video pipeline foundation: generation tools, source_asset_id, video_config

ALTER TABLE public.creative_briefs
  ADD COLUMN IF NOT EXISTS video_config jsonb;

COMMENT ON COLUMN public.creative_briefs.video_config IS
  'Video generation config: source (runway/uploaded), copy variants, slugs, template version.';

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS source_asset_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL;

-- generation_tool is a text column with CHECK constraint (not a PostgreSQL enum)
ALTER TABLE public.creative_assets DROP CONSTRAINT IF EXISTS creative_assets_generation_tool_check;

ALTER TABLE public.creative_assets
  ADD CONSTRAINT creative_assets_generation_tool_check
  CHECK (generation_tool IN (
    'imagen',
    'replicate_mj',
    'gemini',
    'midjourney',
    'higgsfield',
    'manual',
    'runway',
    'composite-video'
  ));

CREATE INDEX IF NOT EXISTS idx_creative_assets_source_asset_id
  ON public.creative_assets(source_asset_id)
  WHERE source_asset_id IS NOT NULL;

COMMENT ON COLUMN public.creative_assets.source_asset_id IS
  'For rendered videos: FK to the base video asset (uploaded or Runway-generated) that this render was composited from. NULL for static assets and base videos.';
