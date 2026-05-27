-- Manual copy of supabase/migrations/20260531150000_listing_host_claim_guardrails.sql

create or replace function public.normalize_listing_copy(input text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(input, '')),
        '[^a-z0-9''\s-]',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.listing_copy_has_host_claim_violation(input text)
returns boolean
language plpgsql
immutable
as $$
declare
  normalized text := public.normalize_listing_copy(input);
begin
  if normalized = '' then
    return false;
  end if;

  if normalized ~ '\mcures?\M' then return true; end if;
  if normalized ~ '\m(medical|clinical|therapeutic) (treatment|benefits?|effects?|outcomes?)\M' then return true; end if;
  if normalized ~ '\mheal(s|ing|ed)?\M' then return true; end if;
  if normalized ~ '\mdiagnos\w*\M' then return true; end if;
  if normalized ~ '\m(fda[- ]?approved|clinically proven|scientifically proven)\M' then return true; end if;
  if normalized ~ '\m(promot(e|es|ing|ed)|boost(s|ed|ing)?|support(s|ed|ing)?|accelerat(e|es|ing|ed)|aid(s|ed|ing)? in) recovery\M' then return true; end if;
  if normalized ~ '\mimprov(e|es|ing|ed) (skin|appearance|complexion)\M' then return true; end if;
  if normalized ~ '\m(support(s|ed|ing)?|promot(e|es|ing|ed)) muscle relaxation\M' then return true; end if;
  if normalized ~ '\m(pain relief|reliev(e|es|ing|ed) (pain|back pain|chronic pain|joint pain|muscle pain|symptoms?))\M' then return true; end if;
  if normalized ~ '\m(back pain|chronic pain|joint pain|muscle pain|nerve pain)\M' then return true; end if;
  if normalized ~ '\m(reduce(s|d|ing)? inflammation|anti[- ]?inflammatory)\M' then return true; end if;
  if normalized ~ '\m(treat(s|ing|ed)?|alleviat(e|es|ing|ed)|eliminat(e|es|ing|ed)) (pain|symptoms?|conditions?|disease|illness|injuries?|arthritis)\M' then return true; end if;
  if normalized ~ '\mfor (arthritis|fibromyalgia|eczema|psoriasis|insomnia|anxiety|depression|diabetes|migraines?|autoimmune)\M' then return true; end if;
  if normalized ~ '\m(prescrib(e|ed|ing|es)|doctor recommended|physician recommended)\M' then return true; end if;

  return false;
end;
$$;

create or replace function public.enforce_listing_host_claim_policy()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_active, false) = true and coalesce(new.is_draft, true) = false then
    if public.listing_copy_has_host_claim_violation(new.title)
       or public.listing_copy_has_host_claim_violation(new.description) then
      raise exception
        'Your listing includes language we can''t publish. Describe the space and session experience and avoid medical, treatment, or health-outcome claims.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_enforce_host_claim_policy on public.listings;
create trigger listings_enforce_host_claim_policy
before insert or update on public.listings
for each row
execute function public.enforce_listing_host_claim_policy();
