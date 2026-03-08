CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  booking_id text,
  message text NOT NULL,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.support_requests
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit support request"
ON public.support_requests
FOR INSERT
WITH CHECK (true);
