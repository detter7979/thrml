alter table public.profiles
add column if not exists notification_preferences jsonb
not null
default '{
  "new_booking": true,
  "booking_cancelled": true,
  "new_review": true,
  "payout_sent": true,
  "marketing_wellness_tips": false,
  "marketing_offers": false,
  "marketing_product_updates": false
}'::jsonb;

alter table public.bookings
add column if not exists reminder_sent boolean default false;
