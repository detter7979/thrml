# Social Publishing Agent — thrml

## Purpose
Publish approved social content from creative_queue directly to platforms via their native APIs.
Only runs against items where approved_at IS NOT NULL and published_at IS NULL.

## Platform APIs (no Buffer needed)

### Meta / Facebook + Instagram
- **API**: Facebook Graph API v19 Content Publishing
- **Credential**: META_MARKETING_API_TOKEN (already set in Vercel)
- **Setup needed**: Store meta_page_id in platform_settings (your Facebook Page ID)
  - Find it: facebook.com → your Page → Settings → Page Info → Page ID
  - Store: INSERT INTO platform_settings (key, value) VALUES ('meta_page_id', '"YOUR_PAGE_ID"')
- **What posts**: Facebook Page feed (auto cross-posts to linked Instagram)
- **Queue types**: social_reel, social_static

### X / Twitter
- **API**: Twitter API v2 (POST /2/tweets)
- **Credential**: TWITTER_BEARER_TOKEN (add to Vercel when ready)
- **Setup**: Apply for Elevated access at developer.twitter.com if needed
- **What posts**: Tweets and threads (splits on double-newline)
- **Queue types**: social_thread

### TikTok (future)
- **API**: TikTok Content Posting API
- **Status**: Requires TikTok for Business account + API approval
- **Queue types**: social_reel (when TikTok credentials added)

## Publishing Rules
- Max 2 posts per platform per run
- Never publish without approved_at being set (Dom must approve in /admin/agents)
- After publishing: update status='PUBLISHED', published_at=now()
- Runs daily at 08:30 UTC — only approved items from previous day get published

## Content Notes
- Always append "Book at usethrml.com" CTA if not already in copy
- Twitter: auto-split on double-newline into thread replies
- Facebook: full caption as single post (Instagram shows first 125 chars before "more")
