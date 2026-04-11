# Social Publishing Agent — thrml

## Purpose
Publish approved social content from creative_queue to Buffer, which schedules posts
across Instagram, TikTok, and X/Twitter. Only runs against items where approved_at IS NOT NULL.

## Buffer Setup
1. Create free Buffer account at buffer.com
2. Connect Instagram Business, TikTok, and X accounts
3. Generate an Access Token at https://buffer.com/developers/apps
4. Add to Vercel as BUFFER_ACCESS_TOKEN
5. Get Channel IDs from Buffer API: GET https://api.bufferapp.com/1/profiles.json
6. Store in Supabase platform_settings as: buffer_channel_instagram, buffer_channel_tiktok, buffer_channel_twitter

## Publishing Rules
- Only publish items with: status='PENDING' AND approved_at IS NOT NULL AND published_at IS NULL
- Schedule posts 24 hours in the future (Buffer handles optimal timing)
- Never post more than 2 items per platform per day
- After publishing: update creative_queue SET status='PUBLISHED', published_at=now(), publish_platform_id=<buffer_id>

## Platform Mapping
| queue_type | Buffer channel setting key |
|---|---|
| social_reel | buffer_channel_instagram + buffer_channel_tiktok |
| social_static | buffer_channel_instagram |
| social_thread | buffer_channel_twitter |

## Content Formatting
- Instagram/TikTok: use copy_suggestion as caption, append hashtags from audience_suggestion field
- Twitter: split copy_suggestion on double-newline into separate tweets in a thread
- All: append "Book at usethrml.com" CTA if not already present

## Rate Limiting
Buffer free plan: 10 scheduled posts per profile at once. Check queue depth before publishing.
