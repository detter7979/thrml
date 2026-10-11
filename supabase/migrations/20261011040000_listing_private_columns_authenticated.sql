-- Follow-up to 20261011030000: signed-in users (authenticated) could still read hosts' street
-- addresses, access/contact details and exact coordinates for every listing. The app now reads
-- those only server-side (admin client) after an ownership or confirmed-booking check, so revoke
-- them from authenticated too. See src/lib/listings/private-fields.ts.
revoke select on public.listings from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'listings'
    and column_name not in (
      'location', 'location_address', 'exact_lat', 'exact_lng',
      'access_instructions', 'check_in_instructions', 'access_method', 'door_operation',
      'onsite_contact_name', 'onsite_contact_phone', 'emergency_contact'
    );
  execute format('grant select (%s) on public.listings to authenticated', cols);
end $$;
