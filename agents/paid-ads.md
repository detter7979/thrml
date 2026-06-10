# thrml Paid Ads Strategy

## Funnel phase optimization (matches naming convention P1/P2/P3)
P1 — Traffic/Engagement, optimized for `become_host_click` or `Lead` 
     Budget: $15–25/day per ad set, low signal threshold
P2 — Conversions, optimized for `host_onboarding_started` or `InitiateCheckout`
     Budget: $25–40/day, scale when 50+ events/week
P3 — Conversions, optimized for `host_first_listing_created` (first listing) or `Purchase`
     Funnel analytics: `host_listing_created` fires on every listing (not the P3 opt target)
     Budget: $40+/day, scale when 50+ events/week

## A/B testing framework
- Always isolate one variable per test (audience OR creative OR copy)
- Min spend before judging: $50 per ad set or 3 conversions
- Winner threshold: CPA < 60% of target AND ≥ 3 purchases
- Loser threshold: spend > $50 AND CPA > 2x target
- When winner found → agent-evaluate auto-duplicates with audience swap
- When loser found → agent-evaluate creates fatigue brief

## Audience playbook
Tier 1 launch markets: Seattle, Portland, Bellevue, Tacoma
Tier 2 scale: Bay Area, LA, Denver, Boulder, Austin
Tier 3 watch: NYC, Chicago, Boston, Toronto, Vancouver

Prospecting interests:
- Wellness: yoga, meditation, sauna, cold plunge, contrast therapy, infrared
- Personalities: Huberman, Wim Hof, Ben Greenfield, Peter Attia
- Lifestyle: hiking, skiing, marathon training, recovery
- Filters: homeowner, age 28–55, HHI $100k+

Lookalike seeds:
- Purchasers (90D)        → 1%, 2%, 3%
- Hosts (all-time)        → 1%, 2%
- ATC no-purchase 14D     → 1% (warm)

Retargeting layers:
- ViewContent 30D minus Purchase 90D
- ATC 14D minus Purchase 90D
- Listing-page-views 7D minus Booking 30D

## Budget rules (agent-evaluate criteria)
- Scale up: CPA < 0.6× target AND 3+ purchases → duplicate ad set, +20% budget
- Scale down: CPA > 1.5× target AND spend > $50 → cut budget 30%
- Pause: CPA > 2× target AND spend > $75 → pause + create fatigue brief
- Warm-up grace: 3 days, no actions during warm-up
- Per-adset CPA override respected from registry table
