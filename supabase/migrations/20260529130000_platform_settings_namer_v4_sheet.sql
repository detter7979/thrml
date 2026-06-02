-- Point namer sync at thrml_namer_v4 (Creative Builder tab).

INSERT INTO public.platform_settings (key, value)
VALUES ('gdrive_namer_sheet_id', '"1bSSZNmE8YENlkUOgHaS689Z1UpU8VAD6j5B0MnQK-HQ"'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();
