-- Per-job overlay choices for the POV video template (text height, optional logo and its opacity).
ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS render_options jsonb;
COMMENT ON COLUMN public.render_jobs.render_options IS 'Per-job overlay choices from the brief: textPositionPct, showLogo, logoOpacity, logoPosition, revision.';
