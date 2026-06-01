# Creative Pipeline QA Checklist

Last verified against codebase: 2026-05-28

## Environment prerequisites

| Check | Status | Notes |
|-------|--------|-------|
| `GCS_BUCKET_NAME` configured | Manual | Static composites + legacy paths |
| `GCS_CREATIVE_BUCKET` configured | Manual | Video bases + renders |
| `GOOGLE_SERVICE_ACCOUNT_JSON` configured | Manual | GCS read/write |
| Imagen / Replicate keys | Manual | Static background generation |
| `MIDJOURNEY_API_KEY` / GoAPI | Manual | Brief reference images (cron) |
| Runway API key | Manual | Video base generation |
| Railway FFmpeg worker running | Manual | Composite video renders |
| Meta Marketing API token + ad account | Manual | Launch to Meta |
| `CREATIVE_STATIC_VARIATIONS` / `CREATIVE_VARIATIONS` | Manual | Defaults to **1** if unset |

## 1A. Recommendation → brief flow

| Step | Code path | Expected | QA status |
|------|-----------|----------|-----------|
| Evaluator dry-run surfaces `GENERATE_CREATIVE` | `/admin/paid-media/evaluator` → rules 08–10 | Recs with `variations: 1–3` in payload | **Pass** (code verified) |
| Approve rec inserts pending brief | `paid-media/actions.ts` → `insertCreativeBriefFromGenerateCreativeRecommendation` | `creative_briefs.status=pending`, `trigger_data.recommendation_id` set | **Pass** (code verified) |
| Brief expansion cron | `/api/cron/agent-creative-brief` | `pending` → `briefed` with hook, copy, visual_direction | **Pass** (cron in vercel.json 08:00 UTC) |
| Legacy fatigue brief auto-insert | `/api/cron/agent-evaluate` | **Disabled** when `creative.legacy_brief_insert=false` in rules | **Pass** (gated) |

## 1B. Static brief review and generation

| Step | Code path | Expected | QA status |
|------|-----------|----------|-----------|
| Edit brief before approval | Creative tab → Edit modal (structured fields) | Copy, variations, formats, naming editable | **Pass** (structured editor) |
| Concept verify (1 variation) | `success_criteria.variations=1` or concept-verify toggle | Single asset before full batch | **Pass** |
| Approve static brief | `/api/agent/approve-brief` → `processStaticBrief` | Assets in Variations Ready | **Pass** (code verified) |
| `convention_name` on static assets | `static-generator.ts` | thrml_namer_v4 name on insert | **Pass** (implemented) |
| Launch to Meta | `/api/agent/launch-creative` | PAUSED ad with headline/CTA/name | **Pass** (code verified; manual ad-set pick) |

## 1C. Video brief flow

| Step | Code path | Expected | QA status |
|------|-----------|----------|-----------|
| Manual video brief | Creative tab → New from template / Video Brief | Draft or approved brief with `video_config` | **Pass** |
| Upload base video | `/api/admin/agent/upload-base-video` | GCS path under unified taxonomy | **Pass** |
| Select existing base from library | Asset library panel | `uploadedGcsPath` set without re-upload | **Pass** |
| Approve → Generate variants | `/api/agent/generate-video` + worker | `composite-video` assets | **Pass** (code verified) |
| Naming on video renders | `video_config.naming` + per-variant tokens | `convention_name` on assets | **Pass** (when naming set) |

## 1D. Known friction (pre-fix baseline)

- Split approval: paid-media queue vs Creative tab (link added via `?brief=` query)
- Two GCS path schemes during migration (legacy + unified)
- 16x9 format not wired in generator (deferred)
- Launch requires manual ad-set selection (by design)

## Manual QA steps (run in staging)

1. `/admin/paid-media/evaluator` — dry-run, confirm `GENERATE_CREATIVE` recs.
2. Approve one rec → `/admin/agents?tab=creative` — confirm brief appears.
3. Select template T1 → edit copy → concept verify → approve → preview 1 static.
4. Generate full batch (3) → approve assets → launch PAUSED to test ad set.
5. Template T2 → pick uploaded base from asset library → generate 2 copy variants → launch.

## Success criteria (initiative complete)

- [ ] Pick template → edit → approve → N assets with `convention_name`
- [ ] Evaluator rec → human approve → same brief flow
- [ ] Concept verify before full variation batch
- [ ] Asset library selects existing upload
- [ ] Launch creates PAUSED Meta ad with namer convention
