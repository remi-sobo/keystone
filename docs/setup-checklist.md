# The one-sweep setup checklist

Everything the build cannot do from the session: accounts to create,
keys to mint, dashboard switches to flip. Updated every ring; do the
whole list in one pass after the full build. Product decisions (the
CONFIRM gates) stay in CURRENT.md; this file is purely operational.

Infrastructure already live (nothing to do): the Supabase project
`keystone` (mvuycjxainskaylvupji) carries all migrations and the
SafeSpace seed; the Vercel project `keystone` builds this repo on every
push, with the public env values committed in vercel.json.

## 1. Supabase dashboard (Authentication > URL Configuration)

- [ ] Set Site URL to the production URL (today `https://keystone-blue-tau.vercel.app`; the real domain when CONFIRM 1 lands).
- [ ] Add to the redirect allow-list:
      `https://keystone-blue-tau.vercel.app/auth/callback` and the
      preview pattern `https://keystone-*-remi-3257s-projects.vercel.app/auth/callback`.
      Magic-link sign-in does not complete until this exists.

## 2. Vercel dashboard (keystone project > Settings > Environment Variables)

All server-only; never NEXT_PUBLIC. The three public values already
ship in vercel.json.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard > Settings > API). Needed from Ring 1 for durable rate limiting and the audit log; from Ring 2 for calendar routes; from Ring 3 for AI routes.
- [ ] `KEYSTONE_TOKEN_SECRET` (mint: `openssl rand -base64 32`). Encrypts stored Google tokens and signs OAuth state. Ring 2.
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see section 3). Ring 2.
- [ ] `ANTHROPIC_API_KEY` (console.anthropic.com > API keys). Ring 3: transcript extraction, and later digest, Q&A, suggestions.
- [ ] `AI_SPEND_HARD_USD_MONTH` / `AI_SPEND_WARN_USD_MONTH` (optional; defaults 50/40).
- [ ] `RESEND_API_KEY` (resend.com; see section 4). Ring 5 messages, Ring 6 digest.
- [ ] `KEYSTONE_FROM_EMAIL` (optional; defaults to `Keystone <hello@soboconsulting.com>`, which requires the domain verified in Resend).
- [ ] `CRON_SECRET` (mint: `openssl rand -hex 24`). Ring 6 digest cron.

## 3. Google Cloud (for calendar sync, Ring 2)

- [ ] Create (or reuse) a Google Cloud project; enable the Google Calendar API.
- [ ] OAuth consent screen: External, scopes `calendar.events`, `calendar.readonly`, `userinfo.email`; add remi@/kendra@/shannon@ as test users (or publish).
- [ ] Create an OAuth client (Web application) with authorized redirect URIs:
      `https://keystone-blue-tau.vercel.app/api/calendar/callback` (plus the real domain later).
- [ ] Copy the client id and secret into the Vercel env vars above.

## 4. Resend (for messages and the digest, Rings 5 and 6)

- [ ] Add and verify the sending domain (soboconsulting.com) in Resend.
- [ ] Mint an API key and set it in Vercel.

## 5. Ship steps

- [ ] Merge branch `claude/nextjs-setup-verify-w0b2qx` to `main`; production deploys from main.
- [ ] After env vars land: redeploy, then in the app connect Google Calendar from Settings and press "Sync sessions now" once.
- [ ] The digest cron is already wired in vercel.json (Fridays 22:00 UTC, the CONFIRM 6 proposal of 3pm Pacific; that is 3pm PDT and 2pm PST, adjust when CONFIRM 6 lands). It runs once CRON_SECRET is set; the first drafts appear on the practice Home for approval, nothing sends without you.
- [ ] Send yourself a magic link (remi@soboconsulting.com is seeded as owner) and do the 390px walk on live data.
- [ ] The "Client Login" nav link on soboconsulting.com: one-line PR in that repo (kept out of this build by the quarry rule).
- [ ] When CONFIRM 1 (domain) lands: point the domain at Vercel, update `NEXT_PUBLIC_APP_URL` in vercel.json, add the domain to the Supabase allow-list and the Google redirect URIs.
