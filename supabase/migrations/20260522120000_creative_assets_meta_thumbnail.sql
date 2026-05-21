-- Meta video creative thumbnail hash (video_id column already exists on creative_assets).

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS meta_thumbnail_image_hash text;

COMMENT ON COLUMN public.creative_assets.meta_thumbnail_image_hash IS
  'Meta image_hash of the auto-generated thumbnail used in the video ad creative. Null for static assets.';
