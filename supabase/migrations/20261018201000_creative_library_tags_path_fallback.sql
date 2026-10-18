-- Persona / angle fall back to the folder a file sits in when the brief doesn't say.
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
  path_parts text[];
  path_persona text;
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

  -- Last resort: the folder the file sits in ({year}/[{month}/]{hosts|guests}/{angle}/...).
  if (new.persona is null or new.angle is null) and new.gcs_path is not null then
    path_parts := string_to_array(regexp_replace(new.gcs_path, '^gs://[^/]+/', ''), '/');
    if array_length(path_parts, 1) >= 4 and path_parts[1] ~ '^[0-9]{4}$' then
      if path_parts[2] ~ '^[0-9]{2}$' then
        path_parts := path_parts[1:1] || path_parts[3:];
      end if;
      path_persona := case lower(path_parts[2]) when 'hosts' then 'host' when 'guests' then 'guest' else null end;
      new.persona := coalesce(new.persona, path_persona);
      new.angle := coalesce(new.angle, path_parts[3]);
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger creative_assets_fill_tags
  before insert or update of convention_name, brief_id, gcs_path on public.creative_assets
  for each row execute function public.fill_creative_asset_tags();

revoke execute on function public.fill_creative_asset_tags() from public, anon, authenticated;
