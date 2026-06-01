-- Track Creative Builder namer sync when assets are approved in the pipeline.

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS namer_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS namer_export_gcs_path text;

COMMENT ON COLUMN public.creative_assets.namer_synced_at IS
  'When this asset row was appended to thrml_namer_v4 Creative Builder tab.';

COMMENT ON COLUMN public.creative_assets.namer_export_gcs_path IS
  'GCS path (creative bucket) of the JSON export for this namer row.';

CREATE INDEX IF NOT EXISTS idx_creative_assets_namer_synced_at
  ON public.creative_assets(namer_synced_at)
  WHERE namer_synced_at IS NOT NULL;
