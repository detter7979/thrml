-- Cloning a listing inserts its already-approximate lat/lng alongside the original exact_lat/lng;
-- keep the provided exact point on INSERT instead of overwriting it with the approximate one.
create or replace function public.listings_approximate_coordinates()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.exact_lat is null or new.exact_lng is null then
      new.exact_lat := new.lat;
      new.exact_lng := new.lng;
    end if;
  elsif new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    new.exact_lat := new.lat;
    new.exact_lng := new.lng;
  else
    return new;
  end if;
  new.lat := round(new.lat * 250) / 250.0;
  new.lng := round(new.lng * 250) / 250.0;
  return new;
end $$;
