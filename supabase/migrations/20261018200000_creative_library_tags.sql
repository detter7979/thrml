-- Creative library: filterable tags on every creative asset.
-- Most tags fill themselves from the brief and the linked namer ad; theme (and any override) is set in admin.

alter table public.creative_assets
  add column if not exists persona text,
  add column if not exists angle text,
  add column if not exists theme text,
  add column if not exists cta text,
  add column if not exists geo text,
  add column if not exists service text,
  add column if not exists hook text,
  add column if not exists template text,
  add column if not exists ad_legacy_id text,
  add column if not exists tags text[] not null default '{}';

create index if not exists creative_assets_library_idx
  on public.creative_assets (persona, angle, created_at desc);

create or replace function public.fill_creative_asset_tags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  td jsonb;
  b_hook text;
  ad_name text;
  parts text[];
begin
  if new.brief_id is not null then
    select cb.trigger_data, cb.hook into td, b_hook from public.creative_briefs cb where cb.id = new.brief_id;
  end if;
  td := coalesce(td, '{}'::jsonb);

  new.ad_legacy_id := coalesce(new.ad_legacy_id, substring(new.convention_name from '^(AD[0-9]+)_'));
  new.template := coalesce(new.template, td #>> '{naming,template_slug}');
  new.angle := coalesce(new.angle, td ->> 'angle');
  new.cta := coalesce(new.cta, td #>> '{naming,cta}');
  new.hook := coalesce(new.hook, b_hook);
  new.persona := coalesce(
    new.persona,
    case lower(coalesce(td ->> 'category', ''))
      when 'hosts' then 'host' when 'host' then 'host'
      when 'guests' then 'guest' when 'guest' then 'guest'
      else null
    end
  );

  -- Linked namer ad: META_host_sauna_SEA_P1_... → persona, service, geo.
  if new.ad_legacy_id is not null and (new.geo is null or new.service is null or new.persona is null) then
    select a.name into ad_name from public.ads a where a.legacy_id = new.ad_legacy_id limit 1;
    if ad_name is not null then
      parts := string_to_array(ad_name, '_');
      if array_length(parts, 1) >= 4 then
        new.persona := coalesce(new.persona, lower(parts[2]));
        new.service := coalesce(new.service, lower(parts[3]));
        new.geo := coalesce(new.geo, upper(parts[4]));
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists creative_assets_fill_tags on public.creative_assets;
create trigger creative_assets_fill_tags
  before insert or update of convention_name, brief_id on public.creative_assets
  for each row execute function public.fill_creative_asset_tags();

revoke execute on function public.fill_creative_asset_tags() from public, anon, authenticated;

-- Backfill existing rows (the trigger fires on this no-op update).
update public.creative_assets set convention_name = convention_name;
