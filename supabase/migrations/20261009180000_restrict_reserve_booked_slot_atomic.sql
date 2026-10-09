-- reserve_booked_slot_atomic is SECURITY DEFINER and trusts p_guest_id, so a signed-in
-- user could call it over /rest/v1/rpc and hold any listing's slots under any guest ID.
-- Only the checkout route calls it, through the service-role client.
revoke execute on function public.reserve_booked_slot_atomic(uuid, uuid, date, time, time) from public, anon, authenticated;
grant execute on function public.reserve_booked_slot_atomic(uuid, uuid, date, time, time) to service_role;
