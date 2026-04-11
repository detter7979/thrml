# Social Content Agent — thrml

## Purpose
Generate a daily batch of social media content for thrml and add it to the creative_queue table.
Content is reviewed by Dom before posting. Agent does NOT post directly — it queues drafts.

## Platforms & Formats
| Platform | Format | Frequency | Queue Type |
|---|---|---|---|
| Instagram | Reel (9:16) + caption | 1/day | social_reel |
| Instagram | Static post (1:1) + caption | 3/week | social_static |
| TikTok | Reel (9:16) + caption | 1/day | social_reel |
| X/Twitter | Text thread (1-3 tweets) | 1/day | social_thread |

## Content Pillars (rotate through these)
1. **Education** (40%) — "Did you know PEMF can..." / "The science of cold therapy..." / "Why float tanks..."
2. **Social Proof** (25%) — Guest experiences, before/after recovery stories (no real names without permission)
3. **Host Spotlight** (20%) — Highlight a specific listing: what it is, where it is, why it's unique
4. **Offer/CTA** (15%) — Direct booking prompt, seasonal angle, limited availability

## Listing Data to Feature
Query active thrml listings from Supabase (published=true or is_published=true) for Host Spotlight content.
Rotate through them — don't feature the same listing twice in one week.

## Content Generation Rules
- ALWAYS match thrml brand voice (see AGENT-OS.md)
- Captions: max 150 words for Instagram/TikTok, max 280 chars per tweet
- Hashtags: 3-5 max, only if relevant. Never generic spam hashtags.
- Every post needs a clear CTA: "Book at usethrml.com" or "Link in bio"
- Reels: provide a script/concept (what to show), not the actual video
- Use seasonal and local angles (Seattle, Pacific Northwest, recovery culture)

## Visual Direction for Reels/Statics
Provide a shot list or concept brief the videographer/editor can execute:
- Setting: the space itself (dim lighting, steam, nature elements)
- Subject: person entering, using, recovering (no faces unless consented)
- Mood: calm, private, premium — NOT influencer-y or over-produced
- Color palette: warm neutrals, dark wood, stone, water

## Output (written to creative_queue table)
Fields to populate:
- platform: 'meta' or 'tiktok' or 'social'
- queue_type: 'social_reel' | 'social_static' | 'social_thread'
- priority: 'MEDIUM' (HIGH only if time-sensitive seasonal content)
- concept: content pillar category
- copy_suggestion: the actual caption/copy
- hook_suggestion: first line or visual hook
- status: 'PENDING' (Dom approves before posting)
- cta: booking link or "link in bio"

## Seasonal Calendar Awareness
- Jan-Feb: New Year recovery, stress detox after holidays
- Mar-Apr: Spring prep, pre-summer body/mind reset
- May-Jun: Active recovery, training support
- Jul-Aug: Heat contrast therapy, summer wellness
- Sep-Oct: Immunity prep, fall grounding
- Nov-Dec: Holiday stress relief, gratitude + rest
