# Reporting Agent — thrml (v2)

## Naming Convention Parser
Parses campaign/adset/ad names directly — no separate Namer doc needed.

### Convention: `{PLATFORM}_{PHASE}_{OBJECTIVE}_{TYPE}_{GOAL}_{CONCEPT}_{MARKET}`

| Position | Values | Examples |
|---|---|---|
| Platform | META, GOOG, TT, SNAP | `META` → Meta |
| Phase | P1, P2, P3 | `P3` → Phase 3 |
| Objective | CONV, AWARE, TRAF, LEAD, APP, REACH, VV | `CONV` → Conversion |
| Type | RT, PRO, LAL, BROAD, INT | `RT` → Retargeting |
| Goal | guest, host | `guest` → Guest |
| Concept | any text | `checkout_rt` → checkout_rt |
| Market | ALL, SEA, LA, NYC, SF, CHI, PDX | `ALL` → All |

### Example Parsing
`META_P3_CONV_RT_guest_checkout_rt_ALL`
→ Platform: **Meta** | Phase: **P3** | Objective: **Conversion** | Type: **Retargeting** | Goal: **Guest** | Concept: **checkout_rt** | Market: **All**

`GOOG_P1_TRAF_PRO_host_sauna_SEA`
→ Platform: **Google** | Phase: **P1** | Objective: **Traffic** | Type: **Prospecting** | Goal: **Host** | Concept: **sauna** | Market: **Seattle**

## Cleaned Report Column Structure
Date | Platform | Campaign ID | Ad Set ID | Ad ID | Campaign Name | Ad Set Name | Ad Name |
Phase | Objective | Type | Goal | Concept | Market |
Spend | Impressions | Clicks | CTR | CPM | CPC |
Purchases | Revenue | ROAS | CPA |
3s Views | 50% Views | 100% Views | VTR | Thumbstop Rate

## OpEx Defaults (in Master Report → OpEx tab)
| Item | Monthly |
|---|---|
| Redis | $7 |
| Resend Starter | $20 |
| Zoho Mail Basic | $1 |
| Domain/DNS | $1.67 |
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| Business Insurance | $50 |
| Stripe | variable |
| Anthropic API | variable |
| Midjourney | $10 |
| Cursor | $20 |
| Google Cloud | $0 |
| **Total Fixed** | **~$109.67** |

## Google Drive Structure
```
thrml Drive (1TGuRiFkgz6ybJymv8B_ZKG88gu0ZJoVv)/
├── Raw/              ← auto-created, 45-day retention
│   ├── Meta_Raw_YYYY-MM-DD
│   └── Google_Raw_YYYY-MM-DD
├── Cleaned/          ← auto-created, 45-day retention
│   ├── Meta_Cleaned_YYYY-MM-DD
│   └── Google_Cleaned_YYYY-MM-DD
└── thrml Master Report ← Daily Data | P&L Dashboard | OpEx | Pivot
```

## Master Report Setup
1. Create Google Sheet called `thrml Master Report` in the Drive folder
2. Share with thrml-agent@watchful-muse-350902.iam.gserviceaccount.com (Editor)
3. Store ID: INSERT INTO platform_settings (key,value) VALUES ('gdrive_master_report_id', '"SHEET_ID"')
4. Agent auto-creates tabs: Daily Data, P&L Dashboard, OpEx, Pivot
5. OpEx tab auto-populated with defaults on first run (won't overwrite manual edits)

## Cron: 02:30 UTC daily
