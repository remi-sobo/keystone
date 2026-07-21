# BloomOS magic link email: setup

The default Supabase auth email is the plain "Your Magic Link / Follow
this link to login" note from `noreply@mail.app.supabase.io`. This doc
replaces it with the designed template at
`supabase/templates/bloom-magic-link.html`: paper canvas, the BloomOS
wordmark with the brass period, a forest button, one brass hairline.
Ten minutes of dashboard work, no code deploy.

## 1. Pick the right project

Email templates are per Supabase project. Open the project that serves
the BloomOS hub you sign in to (the one that sent the email in your
inbox). From this account the Ambition Angels hub candidates are
`aa-fundraising-hub` (ref `zegznwcbsalhhvqhhllz`) and `Ambition-Angels`
(ref `kzzdtibbwsucloaoqpqa`); if unsure, check Authentication > Users
in each for your address with a recent "last sign in".

The same file works for any SOBO family app. For Keystone, swap the
wordmark text `BloomOS` for `Keystone` and the footer line, then paste it
into the `keystone` project (ref `mvuycjxainskaylvupji`) the same way.

## 2. Paste the template (two places, on purpose)

Supabase dashboard > your project > **Authentication > Emails >
Templates** (older UI: Authentication > Email Templates).

1. Open the **Magic Link** tab.
   - Subject: `Your sign-in link for BloomOS`
   - Message body: select everything in the editor, delete it, and
     paste the full contents of `supabase/templates/bloom-magic-link.html`.
   - Save.
2. Open the **Confirm signup** tab and do the same (same subject, same
   body). A person signing in for the first time is a new auth user, so
   Supabase sends them this template instead of Magic Link. Skipping
   this step means every first-time invitee still gets the ugly default.

Leave `{{ .ConfirmationURL }}` exactly as written in both places; it is
the variable Supabase fills with the one-time link. The template uses
no other variables. (A one-time code via `{{ .Token }}` is available,
but do not add it unless the sign-in page has a code entry field, or it
will only confuse people.)

## 3. Fix the sender (recommended, same screen)

The template fixes the body; the sender still reads
`Supabase Auth <noreply@mail.app.supabase.io>` until custom SMTP is
set, and Supabase's built-in sender is development-only (it rate-limits
to a couple of emails per hour for the whole project).

Authentication > Emails > **SMTP Settings**:

- Host `smtp.resend.com`, port `465`, username `resend`
- Password: a Resend API key for a domain verified in Resend
- Sender address: something on that domain, e.g.
  `hello@ambitionangels.org` (or the hub's own domain)
- Sender name: `BloomOS`

This mirrors what `docs/setup-checklist.md` section 1 already
prescribes for the keystone project.

## 4. Sanity checks

- Authentication > URL Configuration: Site URL and the redirect
  allow-list must point at the app, or the pretty link lands somewhere
  broken. (Already covered for keystone in the setup checklist.)
- The email copy says the link expires in an hour, which matches
  Supabase's default email OTP expiry (3600 seconds). If the project
  changed it (Authentication > Sign In / Providers > Email), adjust the
  copy in the template to match.

## 5. Test

Send yourself a fresh link from the sign-in page. Confirm:

- The wordmark, cream card, and forest button render (Gmail, plus one
  phone client).
- The button signs you in; the plain-text fallback link below it works
  too.
- The sender shows `BloomOS` from your domain, not supabase.io, once
  step 3 lands.
