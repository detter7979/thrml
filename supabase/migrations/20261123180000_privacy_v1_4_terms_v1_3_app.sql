-- Publish Privacy Policy v1.4 and Terms of Service v1.3 for the thrml iPhone app.
-- Privacy: new 1.4 (push tokens, camera/photos, location, reports and blocks) and additions to
-- 2 (uses), 4 (App Tracking Transparency and in-app ad tags), 5 (retention), 6 (choices).
-- Terms: new 13A (community standards, zero tolerance, reporting, blocking; App Review 1.2) and a
-- sentence in 19. Both are built from the active rows so nothing else in the text changes.
-- Keep in sync with src/lib/legal/terms-of-service-body.ts and LEGAL_VERSIONS.
begin;

insert into public.legal_documents (doc_type, version, title, body, effective_at, is_active)
select doc_type, 'v1.4', title, replace(replace(replace(replace(replace(replace(body,
    '**Version 1.3 — Effective Date: October 17, 2026**', '**Version 1.4 — Effective Date: November 23, 2026**'),
    '## 2. How We Use Your Information', $legal$### 1.4 Information from the thrml App
When you use the thrml app for iPhone, we also collect:
- **Push notification token:** If you allow notifications, Apple gives your device a token that lets us send you booking, message and account alerts. We store it with your account, along with the app version and when it was last used. We delete it when you sign out on that device, turn off phone notifications in your thrml settings, or delete your account.
- **Photos and camera:** If you choose to take or upload a profile or listing photo, the app asks for camera or photo library access. Only the photo you pick is uploaded. We don't access the rest of your library.
- **Location:** If you tap "Near me" on the map, the app asks for your location to show nearby spaces. It's used to center the map and search, and isn't saved to your account.
- **Reports and blocks:** If you report a listing, review, message or person, we keep the report, your reason and any details you add, and use them to review and act on the report. If you block someone, we keep a record of the block so you can't message each other. The person you report or block isn't told that it was you.

$legal$ || '## 2. How We Use Your Information'),
    '## 3. How We Share Your Information', $legal$- Send push notifications about your bookings, messages, payouts and account, and, if you turn them on, wellness tips, offers and product updates
- Review reports, enforce our Terms and keep our community safe

$legal$ || '## 3. How We Share Your Information'),
    '## 5. Data Retention', $legal$**In the thrml app:** The app asks whether thrml may track your activity across other companies' apps and websites (Apple's App Tracking Transparency prompt). If you tap **Allow**, the app loads the same advertising and analytics tools as our website (Meta Pixel, Google Ads and Google Analytics), and we may send Meta your name, email address, phone number and account ID in hashed (scrambled) form, together with the actions you take, to measure our ads. If you tap **Ask App Not to Track**, none of these tools load in the app and we don't send this information. You can change your choice at any time in your iPhone's Settings under Privacy & Security, then Tracking. We don't access your device's advertising identifier (IDFA).

$legal$ || '## 5. Data Retention'),
    '## 6. Your Rights and Choices', $legal$**App data:** We keep push tokens until you sign out of the app on that device, turn off phone notifications or delete your account. We keep reports and blocks for as long as needed to keep the community safe and meet legal obligations, even after a report is resolved.

$legal$ || '## 6. Your Rights and Choices'),
    '## 7. California Privacy Rights', $legal$**Push notifications:** Turn them off in your thrml notification settings or in your iPhone's Settings. Booking and safety alerts by email continue.

**App tracking:** Change your choice in your iPhone's Settings under Privacy & Security, then Tracking.

$legal$ || '## 7. California Privacy Rights'), '2026-11-23T00:00:00Z', false
from public.legal_documents where doc_type = 'privacy_policy' and is_active;
update public.legal_documents set is_active = false where doc_type = 'privacy_policy' and is_active;
update public.legal_documents set is_active = true where doc_type = 'privacy_policy' and version = 'v1.4';

insert into public.legal_documents (doc_type, version, title, body, effective_at, is_active)
select doc_type, 'v1.3', title, replace(replace(body,
    '14. Limitation of Liability', $legal$13A. Community Standards, Reporting and Blocking
Zero tolerance. thrml has zero tolerance for objectionable content and abusive users. You may not post, upload or send content, including listings, photos, reviews, profile details and messages, that is sexually explicit, hateful, discriminatory, harassing, threatening, violent, defamatory, misleading or illegal, or that exposes someone's private information.
Reporting. You can report any listing, review, message or user from within thrml. Reports are confidential: we don't tell the person who reported them.
Our response. We review reports within 24 hours. If content breaks these Terms, we may remove it and warn, suspend or permanently ban the account that posted it, without notice or refund of fees already earned by thrml. We may also act on content we find ourselves, without a report.
Blocking. You can block another user from a conversation. Once blocked, neither of you can message the other. Information needed for a booking that's already confirmed, such as access instructions, may still be sent. You can unblock someone at any time.
Emergencies. Reporting in thrml is not an emergency service. If anyone is in danger, call 911 first.

$legal$ || '14. Limitation of Liability'),
    $legal$conduct deemed harmful to the platform or its users.

20. Severability$legal$, $legal$conduct deemed harmful to the platform or its users. We may suspend or terminate your account immediately if you break section 13 or 13A, including after a report by another user.

20. Severability$legal$), '2026-11-23T00:00:00Z', false
from public.legal_documents where doc_type = 'terms_of_service' and is_active;
update public.legal_documents set is_active = false where doc_type = 'terms_of_service' and is_active;
update public.legal_documents set is_active = true where doc_type = 'terms_of_service' and version = 'v1.3';

do $check$
declare p text; t text;
begin
  select body into p from public.legal_documents where doc_type = 'privacy_policy' and is_active;
  select body into t from public.legal_documents where doc_type = 'terms_of_service' and is_active;
  if p is null or t is null
     or strpos(p, 'Version 1.4') = 0 or strpos(p, '### 1.4 Information from the thrml App') = 0
     or strpos(p, '- Send push notifications') = 0 or strpos(p, '**In the thrml app:**') = 0
     or strpos(p, '**App data:**') = 0 or strpos(p, '**App tracking:**') = 0
     or strpos(t, '13A. Community Standards') = 0 or strpos(t, 'including after a report by another user') = 0 then
    raise exception 'Legal update did not apply cleanly; nothing published';
  end if;
end
$check$;

commit;
