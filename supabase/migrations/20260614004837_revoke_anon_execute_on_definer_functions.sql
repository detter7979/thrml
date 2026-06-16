-- ALREADY APPLIED REMOTELY (version 20260614004837). This file exists so your
-- local supabase/migrations/ folder matches remote history -- it will NOT
-- re-run on push.
--
-- Item 3 (part 1): revoke direct EXECUTE on SECURITY DEFINER functions.

revoke execute on function public.claim_render_job(text)          from anon, authenticated;
revoke execute on function public.log_booking_acceptances()       from anon, authenticated;
revoke execute on function public.log_booking_legal_acceptance()  from anon, authenticated;
revoke execute on function public.log_profile_acceptances()       from anon, authenticated;
revoke execute on function public.log_profile_legal_acceptance()  from anon, authenticated;
