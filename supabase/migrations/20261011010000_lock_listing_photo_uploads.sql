-- listing-photos let ANY authenticated user upload ANY file (no type/size limit) to ANY path in a
-- public bucket: free public file hosting for abuse. The app uploads to `${userId}/${listingId}/…`
-- (host-new-listing-client.tsx), so scope uploads to the caller's own top-level folder.
drop policy if exists "Authenticated users upload photos" on storage.objects;
create policy listing_photos_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

-- This host policy had no bucket_id check, so it applied to every bucket.
drop policy if exists "Hosts can upload to own listing folders" on storage.objects;
create policy listing_images_host_insert_own_listing on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('listing-photos', 'listing-images')
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(objects.name))[1] and l.host_id = auth.uid()
    )
  );

-- Images only, 15 MB max (phone photos run 3-12 MB).
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']
where id in ('listing-photos', 'listing-images');
