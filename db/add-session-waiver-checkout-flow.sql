-- Session-level waiver acceptance tracking and waiver templates.
-- Safe to run multiple times.

alter table if exists public.bookings
add column if not exists waiver_accepted boolean not null default false,
add column if not exists waiver_accepted_at timestamptz,
add column if not exists waiver_version text;

create table if not exists public.waiver_templates (
  id uuid primary key default gen_random_uuid(),
  service_type text not null,
  version text not null,
  title text not null,
  body text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (service_type, version)
);

alter table public.waiver_templates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'waiver_templates'
      and policyname = 'waiver templates are publicly readable'
  ) then
    create policy "waiver templates are publicly readable"
    on public.waiver_templates
    for select
    using (is_active = true);
  end if;
end $$;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'sauna', 'v1.0-2026-03',
  'Sauna Session - Assumption of Risk',
  'Sauna use involves exposure to high temperatures and carries inherent physical risks including heat exhaustion, heat stroke, dizziness, and dehydration. I confirm that I am in suitable physical health to participate and have consulted a licensed medical professional if I have any cardiovascular conditions, am pregnant, take medications that affect heat regulation, or have any health condition that may be affected by heat exposure.

I voluntarily assume all risks associated with this sauna session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'cold_plunge', 'v1.0-2026-03',
  'Cold Plunge Session - Assumption of Risk',
  'Cold water immersion carries inherent physical risks including cold shock response, hypothermia, cardiac stress, hyperventilation, and loss of consciousness. These risks are heightened for individuals with cardiovascular conditions, high or low blood pressure, Raynaud''s disease, or nerve conditions. I confirm I am in suitable physical health to participate and have consulted a licensed medical professional if any of these conditions apply to me.

I voluntarily assume all risks associated with this cold plunge session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'contrast_therapy', 'v1.0-2026-03',
  'Contrast Therapy Session - Assumption of Risk',
  'Contrast therapy involves alternating between high heat and cold water immersion and carries risks associated with both modalities, including heat exhaustion, cold shock, cardiac stress, dizziness, and fainting. I confirm I am in suitable physical health to participate and have consulted a licensed medical professional if I have any cardiovascular, circulatory, or temperature-sensitivity conditions.

I voluntarily assume all risks associated with this contrast therapy session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'float_tank', 'v1.0-2026-03',
  'Float Tank Session - Assumption of Risk',
  'Sensory deprivation float tank sessions involve enclosed spaces and may cause disorientation, anxiety, or claustrophobic responses. I confirm I do not have open wounds, communicable skin conditions, or infections, and that I am in suitable physical health to participate. I have consulted a licensed medical professional if I have epilepsy, claustrophobia, severe anxiety, or any psychiatric condition.

I voluntarily assume all risks associated with this float tank session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'infrared_light', 'v1.0-2026-03',
  'Infrared Light Therapy Session - Assumption of Risk',
  'Infrared light therapy involves prolonged heat exposure and light frequencies that may cause skin sensitivity, eye strain, or heat-related symptoms. I confirm I am in suitable physical health to participate and have consulted a licensed medical professional if I am pregnant, have photosensitive conditions, take photosensitizing medications, or have any cardiovascular condition.

I voluntarily assume all risks associated with this infrared session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'hyperbaric', 'v1.0-2026-03',
  'Hyperbaric Chamber Session - Assumption of Risk',
  'Hyperbaric oxygen therapy involves pressurized environments and carries risks including ear and sinus barotrauma, oxygen toxicity, and claustrophobic responses. This modality is contraindicated for individuals with untreated pneumothorax, certain lung conditions, recent ear surgery, or fever. I confirm I have reviewed these contraindications and have consulted a licensed medical professional prior to this session.

I voluntarily assume all risks associated with this hyperbaric session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'pemf', 'v1.0-2026-03',
  'PEMF Therapy Session - Assumption of Risk',
  'Pulsed electromagnetic field therapy is contraindicated for individuals with implanted electronic devices (pacemakers, cochlear implants, insulin pumps), active bleeding, or during pregnancy. I confirm none of these contraindications apply to me, or that I have received explicit medical clearance to proceed.

I voluntarily assume all risks associated with this PEMF session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'halotherapy', 'v1.0-2026-03',
  'Salt Therapy Session - Assumption of Risk',
  'Halotherapy involves inhalation of fine salt particles and may aggravate respiratory conditions in some individuals. I confirm I do not have active respiratory infections or conditions that may be worsened by salt inhalation, or that I have consulted a licensed medical professional and received clearance to participate.

I voluntarily assume all risks associated with this halotherapy session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;

insert into public.waiver_templates (service_type, version, title, body, is_active)
values (
  'general', 'v1.0-2026-03',
  'Wellness Session - Assumption of Risk',
  'Participation in wellness activities carries inherent physical risks. I confirm that I am in suitable physical health to participate in this session and have consulted a licensed medical professional if I have any health conditions that may be affected by this activity.

I voluntarily assume all risks associated with this session at {listing_title}, including risks not listed above. I agree that neither Thrml nor the Host shall be liable for any injury, illness, or loss arising from my participation.',
  true
)
on conflict (service_type, version) do update
set title = excluded.title,
    body = excluded.body,
    is_active = true;
