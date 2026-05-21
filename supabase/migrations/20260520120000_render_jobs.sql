-- render_jobs: in-flight video rendering work queue.
-- Workers poll this table for status='pending' rows, claim them by setting
-- status='running' + worker_id, then mark 'completed' or 'failed' when done.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'render_job_status') THEN
    CREATE TYPE public.render_job_status AS ENUM (
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,

  base_video_gcs_path text NOT NULL,
  variant_slug text NOT NULL,
  copy_text text NOT NULL,
  concept_slug text NOT NULL,
  template_version int NOT NULL DEFAULT 1,

  status public.render_job_status NOT NULL DEFAULT 'pending',
  worker_id text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  error_message text,
  error_stack text,

  rendered_gcs_path text,
  rendered_asset_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL,
  duration_ms int,

  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_status_created
  ON public.render_jobs(status, created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_render_jobs_brief_id ON public.render_jobs(brief_id);

CREATE OR REPLACE FUNCTION public.update_render_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_render_jobs_updated_at ON public.render_jobs;
CREATE TRIGGER trg_render_jobs_updated_at
  BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_render_jobs_updated_at();

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.render_jobs IS 'Queue of video rendering work for the Railway worker. Polled every 30s.';
COMMENT ON COLUMN public.render_jobs.worker_id IS 'Unique identifier for the worker process that claimed this job (used for stale-job detection)';
COMMENT ON COLUMN public.render_jobs.attempts IS 'How many times the worker has tried to process this job. Failed jobs with attempts < max_attempts are retried.';

-- Atomic job claim: returns the claimed job or empty.
CREATE OR REPLACE FUNCTION public.claim_render_job(p_worker_id text)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.render_jobs
  SET status = 'running',
      worker_id = p_worker_id,
      attempts = attempts + 1,
      claimed_at = now()
  WHERE id = (
    SELECT id FROM public.render_jobs
    WHERE status = 'pending'
      AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_render_job(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_render_job(text) TO service_role;
