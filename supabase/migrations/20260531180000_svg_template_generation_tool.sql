-- Allow svg_template as a creative_assets generation_tool value.

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
    'composite-video',
    'svg_template'
  ));
