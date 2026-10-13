# BCN Plant Scout Weekly Seed Giveaway

## Preview release

Public information preview and homepage promotion are approved for publication.
Public page visibility is ON; entries and drawings are OFF. The disabled form
collects no information. No production migration, new secret, mobile release,
EAS build, real entry, drawing or subscription change is included.
Feature commit 797a1925db21232bbea4d7166080291c28951791 was pushed to main.
Vercel production deployment dpl_kgBHLxcZnCrUW98CEbHamB819NpE is READY and
serves basecampnorthpa.com. Homepage promotion and the public preview are live.
The mobile card is committed source only; no mobile release was published.

Public URL: https://basecampnorthpa.com/plant-scout-challenge

## Architecture and simplified eligibility

The Expo App.tsx, nested bcn-website Next.js app, Supabase auth/observations,
profiles, trials, RevenueCat, shop inventory and bcn_admins were inspected.
Unrelated local changes are excluded from this feature commit.

Ten NEW saved record IDs during the week qualify automatically; repeated species
are welcome. Extra photos and edits do not increase the count. No contest camera
or Submit Entry button. The mobile home card shows progress, eligibility details
and opt-out when active, Coming Soon otherwise. Normal saving, trials and paid
subscriptions stay unchanged. Free web entry needs no app, photos or payment,
including after an app trial expires; the giveaway grants no paid capabilities.

The unapplied migration preserves first server-save and original creation stamps.
Both must fall within the week; old records cannot qualify through edits or later
sync. Verified identities sync progress on insertion and authenticated status
retrieval. Optional contest failures do not break normal saves. Unconfirmed age,
residency and rules details go to eligibility review rather than being assumed.

Progress contains record IDs/timestamps, not copies of photos, names of plants or
GPS. Direct anonymous/authenticated table access is denied. Backend service-only
functions, restricted private triggers and existing admin auth protect data.
Contest routes exclude analytics/advertising; promo links use full navigation.

Free entry retains validation, Turnstile, honeypot, durable HMAC rate limits and
verified email codes. No marketing opt-in. Verified email/auth ID prevent duplicate
tickets across methods. Similar name/state goes to manual review; households,
shared IPs and devices are not automatically disqualified. Different emails do not
prove different people, so identity review remains necessary.

Opt-out withdraws app entries in undrawn weeks, leaving explicit free entries
intact. Rejoining recalculates progress; previous entries require review.
Account deletion anonymizes entry contact information, removes progress and
preserves immutable audit IDs. The Edge Function tolerates an absent contest schema.

## Draft rules and schedule - legal/privacy review required

Age 18+, 50 U.S. states and D.C., subject to legal review. One eligible entry per
person per week across both methods. No purchase necessary; purchases and
subscriptions do not improve odds. All times America/New_York. Sunday midnight
cutoffs use these exclusive UTC boundaries:

| Week | Entry dates (2026, ET) | Opens UTC | Exclusive closes UTC | Monday drawing |
|---|---|---|---|---|
| 1 | October 19-25 | Oct 19 04:00 | Oct 26 04:00 | October 26 |
| 2 | October 26-November 1 | Oct 26 04:00 | Nov 2 05:00 | November 2 |
| 3 | November 2-8 | Nov 2 05:00 | Nov 9 05:00 | November 9 |
| 4 | November 9-15 | Nov 9 05:00 | Nov 16 05:00 | November 16 |

Week 2 lasts 169 hours because of DST. Server time controls acceptance. Drawing
requires the designated Monday, closed week, reviewed rules, enabled gates and
resolution of every pending entry. No automatic drawing scheduler is deployed.
One equal ticket per eligible person, regardless of method. Cryptographic random
entropy and unbiased rejection sampling select from a locked cohort; immutable
records contain cohort, decisions, actor, entropy, index and winner. Repeat
weekly drawings are blocked.

One winner weekly chooses three eligible in-stock seed packs, standard domestic
shipping included. Reviewed allowlist and current stock checks protect fulfillment.
No automatic inventory decrement, shipping purchase or notification. Admin tracks
notifications and fulfillment manually. Repeat winners across weeks are currently
allowed; alternates/unclaimed prizes require reviewed rules and implementation.

## Independent controls

- SCOUT_CHALLENGE_PAGE_VISIBLE defaults true; preview needs no contest schema/secrets.
- SCOUT_CHALLENGE_ENTRIES_ENABLED defaults false; APIs reject before processing.
- SCOUT_CHALLENGE_DRAWINGS_ENABLED defaults false; backend drawings reject.
- Database entries_enabled/drawings_enabled default false and require approved
  bcn-scout-2026-draft-v2 rules and reviewed_at. Service cannot update config.
- Disabled preview form cannot submit and does not load Turnstile. Legacy contest
  photo upload endpoint always rejects.

Admin /admin/challenge lists week, app users, ten-record accounts, free entries,
eligible pool, private name/email, progress, method, opt-out, reviews, immutable
drawings and notification/fulfillment status. Before migration it shows a disabled
migration-pending state. No public participant list.

## Launch blockers

1. Final legal/privacy approval: sponsor identity/address, state and staff exclusions,
   prize ARV/mailing restrictions, claim deadlines, repeats, alternates, publicity,
   retention and deletion policy.
2. Review/apply migration in staging, run database advisors and production-shaped
   sync/RLS tests; separately approve production migration. None applied here.
3. Configure stable HMAC/Turnstile secrets, reviewed sponsor/rules/prize/retention
   details, seed allowlist, OTP email template, SMTP quotas/delivery and hosting
   rate-limit/origin tests. Preview requires no new configuration.
4. Device/browser QA: old/offline record sync, timestamps, nine/ten counts, opt-out,
   households, cross-method duplicates, OTP retries, accessibility, DST/cutoff,
   expired trials and unpaid accounts, normal shop/subscription flows.
5. Approve/redeploy deletion Edge Function; implement scheduled retention cleanup
   for entries/contact information, abandoned email identities and rate buckets.
   No automatic time-based purge exists yet.
6. Establish staff Monday drawing, eligibility review, notification, stock reservation
   and shipping procedures. No notification/drawing scheduler deployed.
7. Separately approve mobile release; no version/build changes or stores/EAS release.
8. After all approvals deliberately enable backend AND database gates. Keep OFF now.

## Feature file manifest

- App.tsx: only import and home card staged; other edits preserved.
- components/WeeklyChallenge.tsx; tsconfig.json Edge Function exclusion.
- supabase/functions/delete-account/index.ts: optional contest cleanup.
- bcn-website/app/page.tsx and app/plant-scout-challenge/page.tsx: promo/preview.
- bcn-website/app/layout.tsx; components/challenge-analytics-boundary.tsx;
  components/shop-analytics-page-view.tsx: contest analytics exclusion.
- bcn-website/components/challenge-entry-form.tsx: preview/free verified email flow.
- bcn-website/app/api/challenge/route.ts, app/route.ts, photos/route.ts.
- bcn-website/app/admin/challenge/page.tsx; app/api/admin/challenge/route.ts;
  components/admin-challenge.tsx; components/admin-catalog-editor.tsx.
- bcn-website/lib/challenge/core.ts, server.ts, http.ts, jpeg.ts (retained unused utility).
- bcn-website/supabase/migrations/20261013000140_bcn_plant_scout_weekly_challenge.sql.
- bcn-website/tests/challenge.test.ts and challenge-db.test.ts.
- bcn-website/package.json/package-lock.json: pinned PGlite test dependency.
- bcn-website/.env.challenge.example; docs/weekly-challenge.md.

## Validation

Website 143 tests pass including real PostgreSQL/PGlite. Next.js production build
and typecheck pass. Mobile TypeScript, Deno Edge Function check and iOS/Android
JavaScript exports pass. No native build or app release.

Production-mode local preview shows Coming Soon and disabled fields, responds
closed, rejects entry POST and unauthenticated admin. Mobile 390px layout has no
horizontal overflow. Homepage promotion is checked on desktop/mobile.
Generated export/cache files remain untracked and excluded from release.

Production verification (October 12, 2026 ET): landing, homepage, shop and cart
return 200. /api/challenge reports open=false, pageVisible=true,
entriesEnabled=false and drawingsEnabled=false. Web/app/photo entry POSTs all
return 403; anonymous admin returns 401. Browser confirms disabled form fields,
Coming Soon status, no executable Google analytics/advertising scripts on the
contest page, and the homepage promotion. No participant data was submitted.
No production migration, new secret or subscription change was performed.

## Admin dashboard and reporting update

Dashboard: https://basecampnorthpa.com/admin/challenge. Shop admin has a Weekly
Giveaway link; its Analytics tab includes a separate four-week giveaway summary.
Both use the existing verified Supabase bearer session and bcn_admins membership.

Seven counters are derived from database records: accounts with 1+ new records,
accounts reaching ten, accounts with 1-9, verified free email entries, official
eligible participants, total new records and winners. Active means saving a new
record, not login/launch activity. Photo counts and species are not consulted.
Accounts are activity counts; drawing participants are deduplicated people.

The participant table shows account email/username, new record count, method,
qualification status/date and winner status, with eligibility and method filters.
Similar households remain separate; normalized verified email and account IDs
are deduplication keys. Pending eligibility/identity review is distinguished from
the ten-record threshold. Free entry remains eligible even with app opt-out.
App qualification date is the tenth save; free entry date is accepted entry time.
Dates display in Eastern Time; CSV timestamps use UTC.

Existing production schema was checked read-only on October 12, 2026 ET. Contest
tables and immutable observation stamps are absent. Therefore the deployed admin
can preview actual observations.created_at counts without inserting entries or
calling qualification RPCs. These client timestamps are provisional. Official
free-entry, winner and eligible counts display Unavailable until the schema is
reviewed and installed; they are not fabricated zeros. Future-dated records and
soft-deleted records are excluded. New immutable-stamp reporting requires both
creation and save timestamps within the half-open Eastern contest week.

Download Weekly Report exports all selected-week participants independently of
screen filters. The authenticated GET /api/admin/challenge?week=N&format=csv
provides CSV with quoted cells, formula-injection protection and private/no-store
headers. format=summary returns a PII-free text summary suitable for authorized
ChatGPT review. view=analytics returns only aggregates, never participant rows.
The browser periodically refreshes counters while visible; viewing/exporting does
not create official entries, send email or purchase shipping labels.

RevenueCat subscription conversions are explicitly Unavailable: no reliable
purchase/renewal event history exists in the reporting schema. Profile roles and
subscription_status are not treated as contest conversions or eligibility gates.

Draw Winner still requires typed confirmation, entries and drawing gates,
reviewed rules, a closed week on its scheduled Monday and resolved pending
entries. Secure randomness and immutable SQL drawing snapshots are reused. Repeat
drawings are blocked. Existing contact/three-pack/fulfillment tracking remains
manual; historic selected product names remain visible even when stock changes.

No migration or secret was added for reporting. The existing Vercel server-side
service credential is configured; local checkout lacks it, so authenticated live
verification uses the signed-in admin browser instead of copying production keys.
The production database, subscriptions, customer rows, stock and pricing remain
unchanged. Mobile is unaffected and no mobile release is included.

Additional feature files: lib/challenge/admin.ts, reporting.ts,
reporting-server.ts, components/giveaway-analytics.tsx and
tests/challenge-reporting.test.ts. Existing admin route/dashboard/catalog
navigation and this document are extended. Website tests include nine/ten/fifteen
records, cutoffs/DST, old edits, verified free entry, identity deduplication,
opt-out, missing-schema previews, authorization, read-only exports and CSV safety.
Launch blockers above remain, particularly approval of the contest migration and
immutable timestamps, retention, legal/privacy review and operational setup.

Validation for this update: 151 website tests pass, including the PGlite database
test extended to fifteen records/one official entry. Production Next.js build and
TypeScript checks pass. Supabase schema and security advisors were inspected
read-only; no DDL/RLS/privilege changes were made. Mobile source is unchanged.
Production deployment and authenticated browser/export verification are recorded
in the delivery report after publication.

Production verification completed October 12, 2026 ET: feature commit 141d7c2
was pushed and deployment dpl_DxjyADfuX2hKBAhEu6dK4J9R5fLB is READY. The signed-in
admin dashboard shows all seven counters, week selection, participant filters,
aggregate summary and disabled Draw Winner. Weekly activity totals are zero
before October 19, matching an independent read-only Supabase aggregate. Official
counts are correctly Unavailable while the migration is pending. Week 1 CSV was
downloaded and its eight-column header verified; it contains no participant rows.
The Analytics tab shows the four-week giveaway summary and unavailable RevenueCat
conversions. Anonymous dashboard/CSV/summary/analytics API requests return 401.
Production still reports entriesEnabled=false and drawingsEnabled=false.

Repeated Supabase sign-in events with the same session no longer clear a loaded
report or invalidate its pending request. Real session/token changes and sign-out
still clear private data and reload using the new session. This avoids a blank
dashboard when returning focus to the admin browser tab.
