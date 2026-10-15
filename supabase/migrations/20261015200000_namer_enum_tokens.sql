-- Namer tokens used in the thrml-namer sheet that the DB enums did not accept yet.
alter type public.event_t add value if not exists 'LEAD';
alter type public.angle_t add value if not exists 'pov_earnings';
alter type public.ad_format_t add value if not exists 'Video_5s' before 'Video_15s';
