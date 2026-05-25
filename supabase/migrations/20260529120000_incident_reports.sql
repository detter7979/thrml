-- Guest incident reports (support safety workflow + optional post-refund documentation).

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid references public.support_requests (id) on delete set null,
  booking_id text not null,
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'draft',
  incident_at timestamptz,
  location_in_space text,
  injury_type text,
  body_area text,
  severity text check (severity is null or severity in ('minor', 'moderate', 'severe')),
  sought_medical_attention boolean,
  er_or_911_involved boolean,
  narrative text not null default '',
  witness_info text,
  evidence_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incident_reports_booking_id_idx
  on public.incident_reports (booking_id);

create index if not exists incident_reports_support_request_id_idx
  on public.incident_reports (support_request_id)
  where support_request_id is not null;

create unique index if not exists incident_reports_support_request_uidx
  on public.incident_reports (support_request_id)
  where support_request_id is not null;

alter table public.incident_reports enable row level security;

create policy incident_reports_guest_select on public.incident_reports
  for select to authenticated
  using (reporter_user_id = auth.uid());

create policy incident_reports_guest_insert on public.incident_reports
  for insert to authenticated
  with check (reporter_user_id = auth.uid());

create policy incident_reports_guest_update on public.incident_reports
  for update to authenticated
  using (reporter_user_id = auth.uid())
  with check (reporter_user_id = auth.uid());

-- incident-evidence bucket (upload path: {user_id}/{incident_id}/{filename})
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-evidence',
  'incident-evidence',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

create policy incident_evidence_guest_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'incident-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy incident_evidence_guest_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'incident-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy incident_evidence_guest_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'incident-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
