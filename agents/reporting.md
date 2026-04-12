# Reporting Agent — thrml

## Purpose
Build and maintain a fully automated paid media + financial reporting system.
Pulls raw data from Meta and Google Ads APIs, transforms to cleaned reports,
combines with OpEx, and outputs to Google Sheets for analysis and pivoting.

## Google Drive Structure (Reporting folder — separate from Finance)
```
thrml Reporting/                     ← gdrive_reporting_folder_id
├── Raw/                             ← gdrive_raw_folder_id
│   ├── Meta_Raw_YYYY-MM-DD.xlsx    ← appended daily, 45-day retention
│   └── Google_Raw_YYYY-MM-DD.xlsx
├── Cleaned/                         ← gdrive_cleaned_folder_id
│   ├── Meta_Cleaned_YYYY-MM-DD.xlsx
│   └── Google_Cleaned_YYYY-MM-DD.xlsx
├── Namer.xlsx                       ← ID → Name lookup (manually maintained)
└── thrml Master Report.xlsx         ← live dashboard, updated daily
```

## Master Report Tabs
1. `Daily Data`     — rolling 45-day combined cleaned data (Meta + Google)
2. `OpEx`          — recurring costs table (manually updated monthly)
3. `P&L Dashboard` — ad spend vs platform revenue vs costs, custom date range
4. `Pivot`         — filterable by platform, campaign type, goal, date

## Cleaned Report Columns (both platforms normalized)
| Column | Source |
|---|---|
| Date | report date |
| Platform | Meta / Google |
| Campaign ID | raw |
| Campaign Name | Namer lookup |
| Ad Set ID | raw |
| Ad Set Name | Namer lookup |
| Ad ID | raw |
| Ad Name | Namer lookup |
| Campaign Type | Namer lookup (prospecting/retargeting/host_acquisition) |
| Goal | Namer lookup (guest/host) |
| Market | Namer lookup (Seattle/national) |
| Spend | raw |
| Impressions | raw |
| Clicks | raw |
| CTR | calculated |
| CPM | calculated |
| CPC | calculated |
| Purchases | conversions (become_host or make_booking) |
| Revenue | from Supabase bookings (attributed) |
| ROAS | Revenue / Spend |
| CPA | Spend / Purchases |
| Video Views (3s) | raw (Meta only) |
| Video Views (50%) | raw |
| Video Views (100%) | raw |
| VTR (View-Through Rate) | Video Views / Impressions |
| Thumbstop Rate | 3s Views / Impressions |

## Namer Doc Format (Namer.xlsx tab: "Namer")
Columns: ID | Name | Platform | Campaign Type | Goal | Market | Notes

## OpEx Items (OpEx tab)
| Item | Amount | Frequency | Category |
|---|---|---|---|
| Redis (RedisLabs) | 7 | monthly | infrastructure |
| Business Insurance | TBD | monthly | operations |
| Stripe fees | variable | per-transaction | payment |
| Domain/DNS | 1.67 | monthly | infrastructure |
| (add more as needed) | | | |

## P&L Dashboard Metrics
- Total Ad Spend (period)
- Platform Revenue (thrml net fees)
- Gross Booking Value
- Total OpEx (fixed costs in period)
- Gross Profit = Revenue - Ad Spend - OpEx
- Profit Margin %
- Total Bookings
- Booking Conversion Rate (bookings / clicks)
- ROAS (Revenue / Ad Spend)
- CPB (Cost Per Booking)

## Data Flow
1. `agent-reporting` cron (02:30 UTC daily, before other syncs):
   a. Pull Meta insights via Marketing API (45-day lookback)
   b. Pull Google Ads insights via API (45-day lookback)
   c. Write raw data to Raw/ folder (one file per platform per day)
   d. Delete raw files older than 45 days
   e. Read Namer.xlsx to build ID→Name lookup map
   f. Transform raw → cleaned (normalize columns, apply lookups)
   g. Write cleaned data to Cleaned/ folder
   h. Delete cleaned files older than 45 days
   i. Update Daily Data tab in Master Report (upsert by date+platform)
   j. Update P&L Dashboard tab with fresh totals

## Cron Schedule
- 02:30 UTC daily (before agent-finance at 04:00 and agent-evaluate at 03:00)
