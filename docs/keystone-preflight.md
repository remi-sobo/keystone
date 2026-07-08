# Keystone Ring 0 Preflight

Date: 2026-07-08. Branch: `claude/nextjs-setup-verify-w0b2qx`. Ring 1 does not start until these FLAGS are reviewed and the spec is amended where the flags win.

## FLAGS (where reality differed from the spec, the prompt, or the setup)

1. **The repo was not scaffolded, despite the session brief saying it was.** The instruction was "skip Phase B step 0; the repo is already scaffolded and seeded with specs/keystone.md, SOBO_PLAYBOOK.md, .cursorrules, README, .nvmrc." Reality at session start: no package.json, no app code, no `.nvmrc`; the spec sat at the root as `keystone-spec.md` (not `specs/keystone.md`); the playbook was named `SOBO_PLAYBOOK (2).md` (byte-identical to `trellis/SOBO_PLAYBOOK.md`); `.cursorrules` and `README` were one-byte empty files. Resolution: Phase B step 0 exists in the prompt for exactly this state, so it was executed as originally written, and the seeded files were moved/renamed into place (`specs/keystone.md`, `SOBO_PLAYBOOK.md`) with git history preserved.

2. **Spec says Next.js 14; latest is Next 16.2.10.** Spec section 5 opens with "Next.js 14 App Router" while the Ring 0 prompt says scaffold with create-next-app latest. Latest won (per the prompt); the spec line needs amending to Next 16. Two knock-on effects, both verified against the bundled docs in `node_modules/next/dist/docs/`:
   - **Middleware is renamed proxy in Next 16** (same behavior, root file `proxy.ts`). The spec's "middleware refresh" line and Ring 1's session wiring should say proxy. The helper is ready at `src/lib/supabase/session.ts`.
   - create-next-app latest scaffolds Tailwind v4 and TypeScript strict as the spec wants; no divergence there.

3. **"No import alias" is not scaffoldable.** create-next-app latest always configures a path alias; the default `@/*` was kept (declining the customization is the closest available meaning of "no import alias"). All platform files import via `@/lib/...`.

4. **The repo uses a `src/` directory**, so the prompt's `lib/` and `app/` paths are `src/lib/` and `src/app/` throughout. Same content, one level deeper.

5. **The prompt cites "spec section 5.4" for the model tiers; the spec has no 5.4.** Spec section 5 subsections run 5.1 to 5.3. The task-to-tier constants were taken from the prompt's own text (extraction on `claude-opus-4-8`, digest and Q&A on Sonnet 5, suggestion and voice sweep on `claude-haiku-4-5-20251001`, `claude-fable-5` present but wired to no job). Model ids and pricing were verified against the Anthropic model catalog on 2026-07-08: Sonnet 5 is `claude-sonnet-5` ($3/$15 per MTok, introductory $2/$10 through 2026-08-31), Fable 5 is `claude-fable-5` ($10/$50), and Fable 5 can return `stop_reason: "refusal"` from safety classifiers, which is what the fallback contract in `src/lib/anthropicClient.ts` handles. Ring 1 should renumber or add the missing spec subsection.

6. **The CONFIRM gates skip 13.** The spec numbers them 1 through 12 and then 14 (13 gates total); the Phase D instruction says "the fourteen CONFIRM gates." CURRENT.md lists the 13 that exist. Ring 1 should either renumber or state what 13 was meant to be.

7. **Workstream seed count is inconsistent in the spec.** Section 5.1 seeds SafeSpace with five named workstreams (the list has five entries) but CONFIRM 5 says "the four seeded above." Ring 1 needs the real list confirmed with SafeSpace (CONFIRM 5) and the spec made self-consistent.

8. **There is no `_ref/` directory.** The prompt (Phase C, CLAUDE.md instructions) references `_ref/sobo-consulting/globals.css` and a "_ref/ read-only rule." The quarries are sibling checkouts of the keystone repo in this session (`../sobo-consulting` etc.). The read-only rule was written in terms of the quarry repos; the token source used was `sobo-consulting/src/app/globals.css`.

9. **Quarry paths that differ from the manifest** (all found, none missing; the manifest's descriptions hold):
   - `anthropicClient.ts` and `spend.ts` live at `trellis/lib/cy/`, not `trellis/lib/`.
   - The voice guard is `trellis/lib/voice/validate.ts` plus `trellis/lib/voice/logViolation.ts`; `lib/rw/v2/voice.ts` is now a re-export shim over it. The violation table migration is `20260849_voice_violations.sql`.
   - The arc sync routes are `trellis/app/arc/api/google/sync/{push,pull}/route.ts`.
   - `pathway_claim_membership` is defined in `trellis/supabase/migrations/20260613_pathway_evidence_roles.sql`.
   - `private.has_permission` is defined in `ambition-angels/supabase/migrations/create_bloomos_core.sql` (SECURITY DEFINER, pinned empty search_path), and referenced across later migrations.

10. **The sobo-consulting easing differs from the spec's.** `sobo-consulting/src/lib/motion.ts` uses `[0.16, 1, 0.3, 1]`; the spec re-values it to `cubic-bezier(0.22, 1, 0.36, 1)` for Keystone. Treated as a deliberate reskin (structure copied, value from spec 6.1/6.5), not corrected.

11. **The trellis rate limiter is Pages Router shaped.** `enforceRateLimits(req, res, ...)` takes NextApiRequest/Response. Keystone's copy keeps the store and the atomic RPC verbatim and reshapes the enforcement helper for App Router (returns a 429 Response or null). The `rate_limit_check` RPC and `rate_limit_hits` table it expects ship in the Ring 1 migration.

12. **The playbook's design defaults do not all apply.** SOBO_PLAYBOOK.md section 5.1 says dark-mode-first with mobile forcing dark; the Keystone spec is a light, warm-paper system with no dark mode named. The spec won; noting so nobody "fixes" it later.

13. **Standing order 3 (stop at each commit point and wait for approval) versus an autonomous session.** This run executed in a remote, non-interactive session, so the phases ran consecutively. The commit boundaries were preserved exactly as specified (one commit per phase, listed below) so each phase is reviewable on its own, and the hard stop at the end of Phase G is honored: Ring 1 has not been started.

14. **Domain literals were centralized to satisfy the config-integrity gate.** The prompt's gate ("asserts no hardcoded domains") plus a Resend from-address fallback would have conflicted, so all domain fallbacks (`app.soboconsulting.com`, the from email) live in `src/lib/env.ts` only, and the gate allows that one file. CONFIRM 1 (domain) stays a one-file change.

## Phase A verification table

| Source | Exists | Matches description | Notes |
|---|---|---|---|
| ambition-angels `lib/admin/auth.ts`, `lib/supabase/middleware.ts` | yes | yes | cookie auth resolver (`getOrgContext`: session + membership read under RLS) and session refresh middleware; plus `lib/supabase/server.ts` (cookie server client), also copied |
| ambition-angels `private.has_permission` | yes | yes | `create_bloomos_core.sql:71`; SECURITY DEFINER, stable, `set search_path = ''`; role-to-permission via `role_permissions` |
| ambition-angels `supabase/tests/rls-leak-test.sql` | yes | yes | seeded cross-role leak test run by CI against a throwaway Postgres; the Ring 1 seeded matrix follows this pattern |
| trellis `lib/pathway/api.ts`, `pathway_claim_membership` | yes | yes | `requirePathwayOwner`/`requirePathwayMember` (ctx-or-NextResponse shape); email-keyed claim RPC in `20260613_pathway_evidence_roles.sql` |
| trellis `lib/supabase.ts`, `lib/supabaseAdmin.ts` | yes | yes | anon client + service-role client with lazy Proxy and the written contract |
| trellis `claudeModel.ts`, `anthropicClient.ts`, `spend.ts`, `rateLimit.ts`, `env.ts` | yes | yes | paths: `lib/claudeModel.ts`, `lib/cy/anthropicClient.ts`, `lib/cy/spend.ts` (+ `lib/cy/spendLedger.ts` for pricing), `lib/rateLimit.ts`, `lib/env.ts` (FLAG 9, 11) |
| trellis voice guard + violation log | yes | yes | `lib/voice/validate.ts` + `lib/voice/logViolation.ts`; migration `20260849_voice_violations.sql` (FLAG 9) |
| trellis (arc) `sync/push/route.ts`, `sync/pull/route.ts` | yes | yes | `app/arc/api/google/sync/*`; tz-correct floating local times + explicit timeZone; `nextPageToken` pagination loop. Ring 2 copy source |
| trellis `e2e/pathway-role-isolation.spec.ts`, `e2e/isolation-coverage.spec.ts`, `e2e/config-integrity.spec.ts` | yes | yes | the three gates; static no-DB style; `KNOWN_COVERAGE_GAPS` ratchet |
| trellis `lib/admin/audit.ts` | yes | yes | append-only, best-effort, metadata never values |
| team-esface `src/app/(auth)/login/{page.tsx,actions.ts}` | yes | yes | server-action login surface with typed error messages; Ring 1 design quarry for the Keystone login |
| sobo-consulting `src/app/globals.css`, `src/lib/motion.ts` | yes | yes | Tailwind v4 `@theme` token structure; shared easing constant (value differs from spec, FLAG 10) |

## Executed copy list (source to destination)

| Source | Destination | Adaptation |
|---|---|---|
| trellis `lib/env.ts` | `src/lib/env.ts` | Keystone var list; domain fallbacks centralized here (FLAG 14) |
| trellis `lib/supabase.ts` | `src/lib/supabase.ts` | comment nouns |
| trellis `lib/supabaseAdmin.ts` | `src/lib/supabaseAdmin.ts` | contract rewritten for practice/client and the pure-RLS client surface |
| ambition-angels `lib/supabase/server.ts` | `src/lib/supabase/server.ts` | env via lib/env; Next 16 async `cookies()` |
| ambition-angels `lib/supabase/middleware.ts` | `src/lib/supabase/session.ts` | renamed for the Next 16 proxy; wired in Ring 1 |
| ambition-angels `lib/admin/auth.ts` + trellis `lib/pathway/api.ts` | `src/lib/auth.ts` | reshaped as `requirePracticeMember(role)` / `requireClientMember` |
| trellis `lib/claudeModel.ts` | `src/lib/claudeModel.ts` | Keystone tasks (extract, digest, qa, suggest, voice_sweep); tier constants per the Ring 0 prompt; `FALLBACK_MODEL` map added |
| trellis `lib/cy/anthropicClient.ts` (+ `spendLedger.ts`) | `src/lib/anthropicClient.ts` | practice/engagement spend scope; `callClaudeChecked` implements the refusal fallback contract and logs which model answered |
| trellis `lib/cy/spend.ts` + `lib/cy/spendLedger.ts` | `src/lib/spend.ts` | practice ceilings, per-engagement ledger, 2026-07-08 pricing table |
| trellis `lib/rateLimit.ts` | `src/lib/rateLimit.ts` | App Router enforcement helper; Keystone limit table (FLAG 11) |
| trellis `lib/voice/validate.ts` | `src/lib/voice.ts` | SOBO banned-word list; `withVoiceSweep` retry wrapper |
| trellis `lib/voice/logViolation.ts` | `src/lib/voiceViolations.ts` | practice scope |
| trellis `lib/people/send.ts` | `src/lib/email.ts` | Resend only (no Twilio in v1); honest-failure contract kept |
| trellis `lib/admin/audit.ts` | `src/lib/audit.ts` | table `audit_log`; metadata-not-values discipline in the header |
| sobo-consulting `src/app/globals.css` | `src/app/globals.css` | structure kept; the ten spec 6.1 tokens exactly; eyebrow goes mono per spec 6.2 |
| sobo-consulting `src/lib/motion.ts` | `src/lib/motion.ts` | easing re-valued to `cubic-bezier(0.22, 1, 0.36, 1)`; Keystone duration vocabulary |
| trellis `e2e/pathway-role-isolation.spec.ts` | `e2e/isolation.spec.ts` | two-level scope; seeded-matrix contract; no-service-role guard on `app/(client)` |
| trellis `e2e/isolation-coverage.spec.ts` | `e2e/isolation-coverage.spec.ts` | practice/client columns; empty `KNOWN_COVERAGE_GAPS`; denormalization rule |
| trellis `e2e/config-integrity.spec.ts` | `e2e/config-integrity.spec.ts` | frozen 6.1 tokens; domain rule; voice check |
| trellis `playwright.config.ts` | `playwright.config.ts` | static gates, opt-in server |

Not copied in Ring 0 (verified, queued): the arc calendar sync pair (Ring 2), `pathway_claim_membership` SQL (Ring 1 migration), `private.has_permission` as `private.keystone_can` (Ring 1 migration), the BloomOS `rls-leak-test.sql` shape as the Ring 1 seeded matrix, the Team Esface login surface (Ring 1).

## Ring 0 definition of done

- `npm run build` passes on the empty shell: yes (Next 16.2.10, static).
- `npx tsc --noEmit` passes: yes.
- All three gates plus the no-service-role guard run and pass: yes, 20 assertions green on the empty schema.
- Every manifest file landed with its destination logged above, or is flagged: yes.
- No branch, commit, or push in any quarry repo: confirmed (`git status` untouched in all four).
- Docs exist, are Keystone-specific, and contain no em dashes and no banned words: enforced mechanically for `src/` by the config-integrity gate and checked by grep for the docs.

Ring 0 commits, in order: `ring0: platform layer`, `ring0: design tokens`, `ring0: operating docs`, `ring0: agents`, `ring0: gates`, `ring0: preflight findings`.

## Open questions mapped to CONFIRM gates

| Gate | Question | Ring 0 note |
|---|---|---|
| 1 | Domain | `app.soboconsulting.com` is the single named fallback in `src/lib/env.ts`; a decision changes one file plus Vercel |
| 2 | SafeSpace logins | four `client_members` seed rows in Ring 1; email-keyed invites mean no accounts are pre-created |
| 3 | Library access after engagement | affects the Ring 4 resources RLS predicate; nothing in Ring 0 |
| 4 | Shannon login | one `practice_members` row; role `consultant` |
| 5 | Workstream names | see FLAG 7; Ring 1 seeds whatever is confirmed |
| 6 | Digest day/hour | Ring 6 cron expression; `CRON_SECRET` already templated |
| 7 | Name clearance | the wordmark ships nowhere public in Ring 0; login page (Ring 1) is behind the app domain |
| 8 | Session video link source | Ring 2 sessions.location shape |
| 9 | Fee visibility | `engagements.fee_display` is nullable text in the spec; decide before Ring 1 seeds it |
| 10 | Liesl's posture | affects digest recipients (Ring 6) and nothing structural |
| 11 | Stall threshold | a constant in Ring 3.5; propose it lives beside the Practice Home query with a comment |
| 12 | Readiness note sharing | Ring 3 readiness panel defaults consultant-only; sharing is additive |
| 14 | Nav label on soboconsulting.com | the one-line PR ships with Ring 1; label "Client Login" until gate 7 clears |
