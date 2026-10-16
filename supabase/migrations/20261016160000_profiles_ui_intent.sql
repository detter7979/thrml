-- profiles.ui_intent is read/written across the app (navbar, dashboard, signup, host promotion,
-- host-terms acceptance) but the column was never created, so every write that included it
-- failed — e.g. accepting host terms or creating a listing never set is_host / host_terms_*.

alter table public.profiles
  add column if not exists ui_intent text
  check (ui_intent is null or ui_intent in ('guest', 'host', 'both'));

-- Carry the signup choice (stored in auth metadata) onto new profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, full_name, avatar_url, ui_intent)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    case when new.raw_user_meta_data->>'ui_intent' in ('guest', 'host', 'both')
      then new.raw_user_meta_data->>'ui_intent' end
  );
  return new;
end;
$function$;

-- Backfill: signup intent from auth metadata.
update public.profiles p
set ui_intent = u.raw_user_meta_data->>'ui_intent'
from auth.users u
where u.id = p.id
  and p.ui_intent is null
  and u.raw_user_meta_data->>'ui_intent' in ('guest', 'host', 'both');

-- Host-terms acceptances that never reached the profile (the failed writes above).
update public.profiles p
set host_terms_accepted = true,
    host_terms_accepted_at = la.accepted_at,
    host_terms_version = la.version
from (
  select distinct on (user_id) user_id, accepted_at, version
  from public.legal_acceptances
  where doc_type = 'host_terms'
  order by user_id, accepted_at desc
) la
where la.user_id = p.id
  and coalesce(p.host_terms_accepted, false) = false;

-- Anyone who accepted host terms or has a listing is a host (same rule as nextHostUiIntent).
update public.profiles p
set is_host = true,
    ui_intent = case when p.ui_intent = 'host' then 'host' else 'both' end
where coalesce(p.host_terms_accepted, false)
   or exists (select 1 from public.listings l where l.host_id = p.id);
