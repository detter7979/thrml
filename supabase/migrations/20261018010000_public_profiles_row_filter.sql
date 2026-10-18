-- public_profiles used to return every profile to anyone. Hosts stay public; a guest's profile is
-- visible only to themselves and to people they share a booking or conversation with; the server's
-- service role (admin pages, listing reviews) still sees everything.
create or replace view public.public_profiles as
select p.id, p.full_name, p.first_name, p.avatar_url, p.bio, p.tagline, p.languages, p.house_rules,
       p.average_rating, p.total_reviews, p.response_rate, p.response_time_hours, p.host_since, p.is_host, p.id_verified
from public.profiles p
where p.is_host
   or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
   or (auth.uid() is not null and (
        p.id = auth.uid()
        or exists (select 1 from public.bookings b
                   where (b.guest_id = p.id and b.host_id = auth.uid())
                      or (b.host_id = p.id and b.guest_id = auth.uid()))
        or exists (select 1 from public.conversations c
                   where (c.guest_id = p.id and c.host_id = auth.uid())
                      or (c.host_id = p.id and c.guest_id = auth.uid()))
   ));

comment on view public.public_profiles is
  'Public profile fields. Rows: all hosts; otherwise only yourself and people you share a booking or conversation with (service role sees all). Security definer on purpose so it can read profiles past RLS — the WHERE clause is the access rule.';

grant select on public.public_profiles to anon, authenticated;
