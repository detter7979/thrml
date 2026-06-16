-- ALREADY APPLIED REMOTELY (version 20260614004856). Mirror file for local
-- history parity -- will NOT re-run on push.
--
-- Item 3 (part 2): the log_* functions inherited EXECUTE from PUBLIC, so
-- revoking only anon/authenticated left them callable. This closes PUBLIC.
-- service_role keeps access (it bypasses these grants), so trigger-fired
-- logging and the Railway worker are unaffected.

revoke execute on function public.log_booking_acceptances()       from public;
revoke execute on function public.log_booking_legal_acceptance()  from public;
revoke execute on function public.log_profile_acceptances()       from public;
revoke execute on function public.log_profile_legal_acceptance()  from public;
