-- ReviewForm uploads to `review-photos/${userId}/${bookingId}/…`, but the bucket never existed,
-- so any review with photos failed. Public read (photos show on listings), owner-folder writes,
-- images only, 15 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 15728640,
        array['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif'])
on conflict (id) do nothing;

create policy review_photos_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy review_photos_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (auth.uid())::text);
