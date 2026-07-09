# The one-sweep setup checklist

Everything the build cannot do from the session: accounts to create,
keys to mint, dashboard switches to flip. Updated every ring; do the
whole list in one pass after the full build. Product decisions (the
CONFIRM gates) stay in CURRENT.md; this file is purely operational.

Infrastructure already live (nothing to do): the Supabase project
`keystone` (mvuycjxainskaylvupji) carries all migrations and the
SafeSpace seed; the Vercel project `keystone` builds this repo on every
push, with the public env values committed in vercel.json.

## 0. Vercel dashboard: attach the domain (do this first)

- [ ] keystone project > Settings > Domains > add `app.soboconsulting.com`, assigned to Production. DNS already CNAMEs there, so today the domain 404s at Vercel's edge until this step lands. Vercel provisions the certificate itself.

## 1. Supabase dashboard (Authentication > URL Configuration)

- [ ] Set Site URL to `https://app.soboconsulting.com` (CONFIRM 1 decided).
- [ ] Add to the redirect allow-list:
      `https://app.soboconsulting.com/auth/callback`,
      `https://keystone-blue-tau.vercel.app/auth/callback`, and the
      preview pattern `https://keystone-*-remi-3257s-projects.vercel.app/auth/callback`.
      Magic-link sign-in does not complete until this exists.
- [ ] Authentication > Sign In / Providers > Google: turn it on and
      paste the SIGN-IN OAuth client id and secret from section 3b
      (not the calendar pair). The "Continue with Google" button on
      /login shows its could-not-start state until this lands.
- [ ] Authentication > Emails > SMTP Settings: point auth email at Resend
      (host smtp.resend.com, port 465, user `resend`, password = the
      Resend API key from section 4, from `hello@soboconsulting.com`).
      Supabase's built-in sender is development-only and rate-limits to
      a couple of emails per hour project-wide; four SafeSpace logins in
      one morning would hit it. Fine to skip for your own first test.

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
- [ ] OAuth consent screen: External, scopes `calendar.events`, `calendar.readonly`, `userinfo.email`; add remi@/kendra@/shannon@ as test users to start.
- [ ] Then publish the consent screen to production anyway (skip or defer
      Google's verification review). Testing mode expires refresh tokens
      after 7 DAYS, which would disconnect the calendar weekly and force
      a reconnect. Published-but-unverified shows a "Google hasn't
      verified this app" interstitial with a Continue link; only the
      practice's own two or three people ever see it, and the token
      then lives until revoked.
- [ ] Create an OAuth client (Web application) with authorized redirect URIs:
      `https://app.soboconsulting.com/api/calendar/callback` (and
      `https://keystone-blue-tau.vercel.app/api/calendar/callback` as a spare).
- [ ] Copy the client id and secret into the Vercel env vars above.

## 3b. Google Cloud (for Google sign-in; a separate client on purpose)

Sign-in must NOT ride the section 3 client: that consent screen sits in
Testing mode with sensitive calendar scopes and only the three practice
test users, so a SafeSpace member pressing "Continue with Google" would
be refused at Google's door. Basic identity scopes need no Google
verification, so a dedicated project publishes to production cleanly.

- [ ] Create a second Google Cloud project (say `keystone-signin`).
- [ ] OAuth consent screen: External, ONLY the non-sensitive identity
      scopes (openid, userinfo.email, userinfo.profile), then publish
      to production. No verification review at this scope level.
- [ ] Create an OAuth client (Web application) with one authorized
      redirect URI:
      `https://mvuycjxainskaylvupji.supabase.co/auth/v1/callback`.
      Google returns to Supabase; Supabase returns to the app's
      /auth/callback via the section 1 allow-list, so no app domain
      appears here.
- [ ] Paste this client's id and secret into the Supabase Google
      provider (section 1). These are Supabase-side config, never
      Vercel env vars; GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in
      section 2 remain the calendar pair.

## 4. Resend (for messages and the digest, Rings 5 and 6)

- [ ] Add and verify the sending domain (soboconsulting.com) in Resend.
- [ ] Mint an API key and set it in Vercel.

## 5. Ship steps

- [x] Merge branch `claude/nextjs-setup-verify-w0b2qx` to `main`: done 2026-07-09 (fast-forward, f4dc98b); production is live at keystone-blue-tau.vercel.app and waits on the env steps above.
- [ ] After env vars land: redeploy, then in the app connect Google Calendar from Settings and press "Sync sessions now" once.
- [ ] The digest cron is already wired in vercel.json (Fridays 22:00 UTC, the CONFIRM 6 proposal of 3pm Pacific; that is 3pm PDT and 2pm PST, adjust when CONFIRM 6 lands). It runs once CRON_SECRET is set; the first drafts appear on the practice Home for approval, nothing sends without you.
- [ ] Send yourself a magic link (remi@soboconsulting.com is seeded as owner) and do the 390px walk on live data.
- [ ] Press "Continue with Google" once on the live login page with an
      invited Google-hosted email; confirm it lands on the right
      surface, then once with an uninvited account to see the honest
      no-access state.
- [ ] The "Client Login" nav link on soboconsulting.com: one-line PR in that repo (kept out of this build by the quarry rule).
- [x] CONFIRM 1 landed (app.soboconsulting.com): DNS is pointed, vercel.json carries the domain. Covered by sections 0, 1, and 3 above.
