# BCN Plant Scout Weekly Seed Giveaway

## Mobile-first presentation redesign - October 12, 2026 ET

The giveaway page now prioritizes Plant Scout downloads for mobile social traffic.
The forest-green hero leads with the BCN giveaway title, 4 Weeks. 4 Winners. /
Win Free Seeds!, dates, three-pack prize value/shipping and a short ten-save
explanation. Existing iPhone/Android store URLs move into the hero as full-width
stacked phone buttons, followed by a visible secondary free-entry anchor. Both
store URLs were fetched and returned 200 with BCN Plant Scout titles. Equal odds
and no-purchase text remain visible. Customer-facing launch/test language replaces
technical activation flags; backend gates are unchanged.

Three actual eligible-catalog example photos retain their existing data selection
and restrictions. Phone presentation uses two columns with a centered third pack;
tablet/desktop use three columns. Square image containers reserve space and names
wrap. Desktop retains the forest-green hero/prize panel and cream BCN styling;
the two-panel hero starts at 1024px to keep tablet photos readable. Steps use
short descriptions and compact phone rows. The four Eastern-Time schedule dates
are mobile cards below 768px and a semantic table above that width.

The preview form preserves the exact handler/payload/required acknowledgment,
honeypot, rate/proof controls and success message. Its button says Submit Test
Entry. Fields use readable 16px text and 48px targets; name has a first/last-name
hint. Privacy uses the requested concise summary and keyboard-accessible native
details, retaining server time, seven-day retention/daily purge, deletion contact,
no-account/no-email/no-marketing, admin-only access and backup limitations.
Keyboard focus outlines and reduced-motion scrolling are provided. Small text
uses pine for contrast; rust accents remain on large step numbers.

The shared header is more compact on phones (56px logo/cart row) with visible
Shop and Weekly Giveaway links. A native Menu disclosure retains Scout App,
Articles, About and Contact; desktop navigation and CartLink behavior are intact.
All giveaway controls are at least 48px high; mobile nav targets are at least 44px.

Changed files: app/plant-scout-challenge/page.tsx, components/challenge-preview-form.tsx,
components/site-header.tsx, app/globals.css (under bcn-website) and this document.
No API, schema, environment variable, record, account, subscription, inventory,
admin, drawing control or mobile app source changes. No production form submit
is part of this redesign verification. Existing backend regression tests exercise
the submission flow without changing production records.

Validation: 160 website tests passed, website TypeScript and production build
passed. Local browser checks cover 375px iPhone, 412px Android, 768px tablet and
1440px desktop with no horizontal overflow; the three real catalog images load,
phone CTAs stack, schedule cards/table switch and store hrefs remain identical.
Local preview collection fails closed without production secrets. Enabled form
presentation and unchanged live activation are checked after deployment without
creating new submissions. Local Next image-cache write warnings occur on Windows;
images still decode successfully. Live image delivery is checked separately.

## Public preview form implementation - October 12, 2026 ET

The user authorized a simple public test form with NO email verification, account
creation, email delivery or notifications. This supersedes the email-verification
proposal below. The preview has its own endpoint, storage, security gate and admin
category; official entries, automatic qualification, drawings and fulfillment
remain OFF. Preview rows have permanent PREVIEW ONLY status and never enter
official reporting or drawing pools. No conversion/backfill is implemented.

Public URL: https://basecampnorthpa.com/plant-scout-challenge
Admin URL: https://basecampnorthpa.com/admin/challenge -> Preview Submissions

### Exact migration review and production scope

Migration: bcn-website/supabase/migrations/
20261013021123_bcn_weekly_preview_submissions.sql, generated with Supabase CLI.
Only four new scout_preview tables and three new SECURITY INVOKER functions are
created. No existing table, role definition, account, trigger, product or official
contest object is altered. The pending official challenge migration is NOT applied.
There are no account/contest foreign keys, signup calls, email integrations or
qualification triggers. Submission ID/time/expiry are database-generated.

RLS is enabled with explicit deny policies on all four tables. Public/anon/
authenticated privileges are revoked, including function execution. The server
service role has only needed grants; it cannot update the configuration gate or
submission rows. Admin API access first verifies the user through existing
requireAdmin/bcn_admins. No service credential appears in browser assets.

The exact migration passed real PostgreSQL/PGlite tests for public CRUD/RPC denial,
service grants, closed gate, duplicate email/week, token replay, permanent test
status, server timestamps and scoped retention deletion. It was applied through
Supabase apply_migration to hjcskfmssgpdgrhhqzvk successfully. Post-migration
security advisors report no scout_preview findings. Pre-existing article, shop
function and Auth advisory findings remain unchanged and outside this migration.

### Preview spam controls and configuration

Turnstile is not configured. Its deliberate alternative is a signed browser
SHA-256 proof-of-work challenge (16 zero bits), bound to the proxy-derived IP hash,
valid for 5 minutes with a minimum 1.5-second age. Challenges are single-use;
consumption and submission insert occur in one database transaction. This is
lightweight bot friction, not a claim that determined automation is impossible.
The browser worker uses Web Crypto with a 60-second timeout; unsupported/failed
security checks fail closed. No private form data enters the worker.

Durable atomic limits: challenge issuance 30/IP/hour and 500/global/hour;
submission attempts 10/IP/hour and 200/global/hour; normalized email 3/day.
Keys are HMACs, never raw IPs/emails. Limits work across serverless instances and
may temporarily throttle a shared network; this is abuse prevention, not household
contest disqualification. Same-origin JSON requests, bounded bodies, server-side
name/email/state/week/consent validation and a honeypot are also required.
Duplicate normalized email + selected week returns the same generic success,
without additional rows or publicly revealing whether that email already exists.
Different weeks/emails remain distinct; plus tags are not silently merged.

Production configuration: SCOUT_PREVIEW_ENABLED=true, a generated server-only
SCOUT_PREVIEW_SECRET, and a generated CRON_SECRET. Secrets are sensitive Vercel
variables; they are not checked in. Official SCOUT_CHALLENGE entry/drawing gates
are unchanged. Database enabled starts false; reviewed_at and cleanup_verified_at
must be set after validation before enabling collection. A config failure returns
closed/unavailable, never writes through to official entry handling.

### Retention, consent and deletion

The notice version is preview-2026-v1. Explicit acknowledgment is required before
submit. Collect only first/last name, email, state, interested week and server time.
No age/account/plant/photo/GPS/payment data is collected. Emails are UNVERIFIED
and must not be treated as proof of identity. No messages or marketing enrollment.

Retention: seven days. Expired rows immediately disappear from admin views/CSV;
Vercel cron at 08:00 UTC daily invokes /api/challenge/preview/cleanup to purge them
within 24 hours of expiry. The endpoint requires CRON_SECRET and only calls the
preview purge function. Proofs expire after ten minutes; rate rows expire one day
after their bucket. Daily cleanup also removes these. Monitor the Vercel cron
deployment/logs and investigate any non-200 run. No database extension is added.
If cleanup/configuration fails, disable the database preview gate while repairing.
Backups/provider logs can outlast active-table deletion; no immediate backup
deletion promise is made. No raw submitted bodies or participant PII are logged.

Early deletion: visitor uses /contact with submission email and selected week.
Authorized staff confirm the requester's control of that email out of band, then
delete ONLY the matching scout_preview_submissions row(s) through a reviewed,
parameterized database operation. Never delete a Plant Scout account or edit
official immutable records. Exported CSV files contain private data; restrict
access and delete staff copies on the same schedule or earlier upon request.
Retain only a PII-free deletion outcome if operational auditing is necessary.

Admin Preview Submissions shows total, name, email, state, week, time (Eastern)
and PREVIEW ONLY status, with unverified-email notice, filters, pagination and
CSV of all matching rows. Both the list and export exclude expired submissions
and require authorized admin membership. They are separate from activity and
official participant reports. CSV neutralizes formula prefixes.

Validation: all 160 tests passed, website TypeScript and Next.js production build
passed. Feature commit 985f311fec14e18c45133a27a2c51621d6da4691 was pushed to main;
production deployment dpl_5scLdWe9xW5DxDvjXkQke9tNXoLT is READY with the BCN
production domains assigned. The sensitive preview/cron secrets and preview-only
environment gate are configured; no secret values were printed or committed.

Live verification (October 12, 2026 ET): cleanup invocation with the configured
secret returned 200/deleted=0; unauthenticated cleanup returns 401. The daily cron
is configured in the deployed vercel.json at 08:00 UTC. Its first scheduled run
has not occurred yet; the same protected handler was exercised successfully.
Preview database gate was enabled only after migration/advisor/build/admin/cleanup
checks passed, with reviewed_at and cleanup_verified_at recorded. The public page
now reports preview ON and official entries/automatic qualification/drawings/
fulfillment OFF, with the specified start date and four-winners banner.

An actual browser submission using synthetic name BCN Preview Test and reserved
email preview-test-20261012@example.invalid received the exact requested success
message. One PREVIEW ONLY row is visible in the signed-in admin tab, with PA,
week 1 and server submission time 2026-10-13T02:23:59.402969Z. Week 2 filters it
out, week 1 and name search show it, and the downloaded CSV contains exactly the
synthetic row, test-only status and unverified-email notice. This disposable test
row is left for the user to inspect and will expire normally after seven days.

Independent production queries confirm exactly one matching preview row, zero
matching Auth accounts, no installed official challenge tables, RLS ON for all
four new tables and no public/authenticated CRUD or function-execution privileges.
Anonymous admin preview list/CSV endpoints return 401. The official public API
still reports open=false, entriesEnabled=false and drawingsEnabled=false. No
email/notification or marketing action was performed. Existing records, customers,
subscriptions and inventory were not modified.

Mobile viewport check: the live form renders enabled with no horizontal overflow.
Desktop public submit and protected admin filtering/export were verified. Browser
proof-work completed successfully in the public flow. An optional repeat mobile
submission was interrupted when the browser tab moved away; duplicate/replay
protection is verified by automated handler/PostgreSQL tests, and the stored
synthetic row count remains one. No repeated public test row was created.

No blocker remains for this simple unverified preview. Continue monitoring the
daily retention job. Official launch still requires its separate legal/privacy,
schema/immutable timestamp and operational approvals. Existing unrelated Supabase
advisories are unchanged: see the documented [view security](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
and [Auth protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
guidance; none apply to the new preview objects or were bypassed for this release.

## Historical email-verification readiness review - superseded

Status: BLOCKED, not launched. The public page remains Coming Soon with a
disabled form. No preview submissions, official entries, emails or drawings
were created during this review. No production migration or configuration was
changed. The existing all-user activity dashboard remains available.

Read-only production checks confirmed:

- The public API reports open=false, entriesEnabled=false and drawingsEnabled=false.
- The anonymous admin API returns 401; existing authorized reporting uses
  requireAdmin and bcn_admins membership.
- No scout_challenge tables are installed. Existing profiles, observations and
  bcn_admins have RLS enabled. There is no preview submission/verification store.
- Vercel production has the existing server-side Supabase credential, but no
  challenge HMAC secret, Turnstile keys or identifiable standalone transactional
  email-provider configuration. Secret values were not retrieved.
- The current web-entry handler is an OFF-gated official-entry flow. Its email
  step calls Supabase Auth signInWithOtp with shouldCreateUser=true and verification
  signs in that identity before writing an official entry. It must not be reused
  for this preview: a new visitor would create an Auth account, contrary to the
  requirement to leave Plant Scout accounts unchanged.
- The available Supabase connector does not expose Auth SMTP settings. Auth email
  delivery/provider/domain status therefore has not been confirmed. Auth OTP
  configuration alone would not establish an independent preview email service.

### Separate implementation required before collecting test data

Prepare and review a preview-only migration separately from the pending official
contest migration. Do not apply the official migration to enable the test form.
The preview design must have its own default-OFF switch and privacy-review gate,
submission store, one-time verification store and atomic durable rate limiter.
No Auth/profile/observation/subscription/inventory writes or triggers are allowed.
No foreign keys to account or official contest tables are needed.

Proposed submission fields: random ID, normalized email duplicate key, name,
email, state, age confirmation, privacy acknowledgment/version, submission time,
verification time and expires_at. Test status is always PREVIEW ONLY; official
eligibility is always false. Keep raw codes and IP addresses out of storage and
logs. Store only an HMAC of the random verification token, a short expiry and
bounded failed-attempt count. Verification must atomically consume the token.
Service-only database grants and RLS must deny anon/authenticated direct reads
and writes. Admin reports must exclude token hashes and abuse-control keys.

The independent request endpoint must fail closed unless all preview prerequisites
are ready. Require same-origin requests, bounded bodies, server validation,
honeypot, hostname/action-validated Turnstile and atomic email/IP rate limits.
Use a standalone transactional email integration, not an account-sign-in flow.
Normalize case/whitespace for duplicates without stripping plus tags or merging
households. Avoid exposing whether an email has already submitted. No marketing
list integration or automatic marketing consent. Official routes and drawings
must keep their existing OFF gates.

Public text must say: PREVIEW ONLY - this is a test submission, not an official
contest entry, and it provides no prize eligibility. Explain the data collected,
verification email, purpose, retention, deletion contact and absence of marketing
signup before consent. Do not require agreement to draft official contest rules
as if they were approved. Add a separate admin Preview submissions category with
submitted time, email verification status and permanent test status. Preview rows
must never feed official totals, drawing pools or a future conversion/backfill.

### Proposed retention and deletion procedure - approval required

Proposed limits, not an approved policy: verification tokens expire in 15 minutes;
unverified submissions are deleted after 24 hours, verified test submissions after
7 days, and rate buckets after 24 hours. A scheduled, monitored purge must run
before public collection is enabled; documentation alone is not a working purge.
Deletion must remove the submission and associated verification material, without
touching Auth accounts or official immutable drawing/audit records. An authorized
admin should handle deletion requests through the existing BCN contact channel,
verify control of the supplied email, and record only a PII-free deletion outcome.
There must be no automatic migration of preview contacts to official entries or
marketing lists. Include database backup and provider-log retention in the reviewed
privacy policy; immediate active-table deletion is not a guarantee of immediate
backup deletion. Final timing/contact and provider processing require approval.

### Approval and end-to-end launch checklist

1. Confirm the standalone email provider, verified sender/domain and test inbox.
   Configure credentials securely; never request or paste secrets in chat.
2. Review the separate preview-only SQL, RLS/grants, privacy notice and retention
   schedule. Obtain explicit approval before applying a production migration or
   adding production secrets/configuration. No SQL is applied by this document.
3. Implement/test the isolated handler, form, admin category and purge against
   an isolated database, including duplicates, concurrency, retries, token expiry,
   failed delivery, rate limits and bot failures.
4. Run the installed-schema security advisors and direct anon/authenticated
   denial tests. Test authorized admin access and exclusion from official totals.
5. Verify an actual provider-delivered email in an authorized test inbox and
   complete one-time verification end-to-end. Check replay/expiry/retry behavior
   and that no Auth/profile row, official entry or marketing signup is created.
6. Run automated tests, TypeScript and production build. Deploy only after all
   safeguards pass. Official entries, app qualification, drawings and fulfillment
   remain OFF; separately enable only the reviewed preview mode.

Current email end-to-end result: NOT RUN / BLOCKED. No independent configured
preview email integration or installed preview schema exists. Preview admin
reporting is not implemented or live. Existing tests/build validate the existing
disabled implementation, not a usable public email test form. No deployment commit
is produced by this readiness review.

Readiness validation: all 156 existing website tests passed; npx.cmd tsc --noEmit
and npm.cmd run build passed. Only this documentation file was changed. No
application code, production data, environment variables or account records were
modified. Existing unrelated local edits remain excluded.

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

## All-user activity before launch

The admin dashboard now defaults to All-user activity, separate from Official
contest reporting. The current Eastern Monday-Sunday week and the preceding
52 weeks are selectable, so activity before October 19 is visible. Every row,
the view banner and activity CSV are labeled Activity Only — Not Official
Contest Entries. Reaching ten is an activity threshold, not eligibility.

All profile accounts appear, including zero-save accounts, plus record owners
whose profile is missing. No friend/tester, plan_role, role or subscription filter
is applied. Separate non-deleted record IDs are counted by existing created_at;
photos, species and updated_at do not affect counts. Future timestamps are
excluded. Cloud sync is required; unsynced device-only saves cannot be reported.
Account email/username and counts are visible only after existing admin auth.
The activity view supports week, local account search and count bands (0, 1-9,
10+) and an authenticated activity-only CSV. Refresh is automatic while visible.

Existing saved contest opt-outs, when installed, conservatively exclude those
accounts from named activity and activity totals. Missing opt-out storage is
explicitly labeled; any other preference-read error fails closed. No private
locations, images, plant names, trials or billing information are queried.

GET /api/admin/challenge?mode=activity only performs SELECTs. It never calls
qualification/entry/drawing RPCs, and neither view nor CSV can convert historic
or pre-launch activity into entries. The existing public page remains Coming
Soon, and official app entries, free submissions and drawings stay OFF.
No production migration, new secret, customer edit or permission change is
required for these activity reports. Official launch still requires the reviewed
contest migration, immutable timestamps and explicit non-retroactive launch QA.

Files added: lib/challenge/activity.ts, components/plant-scout-activity.tsx and
tests/challenge-activity.test.ts. Existing protected admin route, reporting-server
and admin-challenge components are extended. Mobile code is unchanged.

Validation: 156 website tests, website TypeScript and Next.js production build
pass. Read-only production aggregates show 16 profile accounts; October 5-11 has
four new non-deleted records across three accounts, while October 12-18 has zero
records as of the October 12 review. These are activity counts, never entries.
