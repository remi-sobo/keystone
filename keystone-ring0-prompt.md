# Keystone Ring 0: Preflight

> **Before sending this prompt (Claude Code on the web):** in the repository selector, add `remi-sobo/keystone` first (the working repo) plus the four quarries: `trellis`, `ambition-angels`, `team-esface`, `sobo-consulting`. Set the model picker to Sonnet. Use an environment with Trusted network access.

## Standing orders (these persist for the entire build)

1. The spec at `specs/keystone.md` in the keystone repo is the source of truth. Read it in full before anything else.
2. `keystone` is the ONLY repository you write to. The other four repositories in this session (trellis, ambition-angels, team-esface, sobo-consulting) are read-only quarries: read them, copy patterns into keystone, adapt. Never create a branch, commit, or push in any repository except keystone.
3. One phase at a time. Each phase below ends in a commit. Stop at each commit point, summarize what landed, and wait for approval before the next phase.
4. Diagnose before repair. If reality differs from the spec or this prompt, stop and flag it. Do not silently correct.
5. No em dashes anywhere: code comments, docs, strings, commit messages. No banned words (transformative, holistic, leverage, unlock, seamless, robust, pivotal).
6. Never invent content. If a source path, table, or pattern does not exist as described, log it as a FLAG, do not fabricate a substitute.

## Phase A: Verify the quarry (no writes)

Use the quarry-scout agent (created in Phase E, so for this phase use read-only exploration directly) to confirm each source below exists and does what the manifest claims. Output a table: source path, exists yes/no, matches description yes/no, notes. Log mismatches under FLAGS in `docs/keystone-preflight.md` (created in Phase G; hold findings until then).

| Source | Expect |
|---|---|
| ambition-angels : `lib/admin/auth.ts`, `lib/supabase/middleware.ts` | cookie auth resolver + session refresh middleware |
| ambition-angels : `private.has_permission` (search migrations) | permission authority SECURITY DEFINER function |
| ambition-angels : `supabase/tests/rls-leak-test.sql` | seeded RLS leak test |
| trellis : `lib/pathway/api.ts`, `pathway_claim_membership` | member resolvers, email-keyed invite claim RPC |
| trellis : `lib/supabase.ts`, `lib/supabaseAdmin.ts` | anon + service-role clients, lazy proxy, written contract |
| trellis : `claudeModel.ts`, `anthropicClient.ts`, `spend.ts`, `rateLimit.ts`, `env.ts` | AI client stack, cost ledger, rate limiting, env loader |
| trellis : voice guard + violation log (search `lib/` for voice/violation) | banned-word sweep + audit table |
| trellis (arc) : `sync/push/route.ts`, `sync/pull/route.ts` | Google Calendar OAuth, tz-correct push, paginated pull |
| trellis : `e2e/pathway-role-isolation.spec.ts`, `e2e/isolation-coverage.spec.ts`, `e2e/config-integrity.spec.ts` | the three CI gates |
| trellis : `lib/admin/audit.ts` | metadata-only append audit |
| team-esface : login page/route | login surface shape (design quarry for the Keystone login) |
| sobo-consulting : `globals.css`, `lib/motion.ts` | token structure, shared easing |

Commit: `ring0: quarry verification` (the table goes in the preflight doc; commit docs only, Phase G).
Actually: hold this commit until Phase G. Phase A produces findings, not files.

## Phase B: Scaffold and platform layer

0. If the keystone repo contains only the seeded docs (spec, prompts, README), scaffold it now: create-next-app at the repo root (latest, App Router, TypeScript strict, Tailwind v4, src dir, no import alias), preserving the seeded files. Pin Node 22 in `.nvmrc`. Copy `SOBO_PLAYBOOK.md` in from the trellis quarry. Create `.cursorrules` with the per-feature gate from the playbook, scope nouns swapped to practice/client, plus the quarry read-only rule.
1. Confirm the installed Next version and read its bundled docs in `node_modules/next/dist/docs/` before writing any routing or metadata code. Do not assume training-data APIs.
2. Copy the verified platform layer into `lib/`, renaming scope nouns to the two-level scheme: `practice_id` (top tenant), `client_id` (nested). Files: both Supabase clients with the contract comment, auth resolvers reshaped as `requirePracticeMember(role)` and `requireClientMember`, `claudeModel.ts`, `anthropicClient.ts`, `spend.ts`, `rateLimit.ts`, `env.ts`, the voice guard with the SOBO banned-word list, Resend wrapper, `lib/admin/audit.ts` as `lib/audit.ts`.
3. `claudeModel.ts` gets the Keystone task-to-tier constants from spec §5.4: transcript extraction on `claude-opus-4-8`, digest and Q&A on Sonnet 5, suggestion and voice sweep on `claude-haiku-4-5-20251001`, and a `claude-fable-5` entry present but not wired to any job, with the fallback contract (declared fallback model, `stop_reason: "refusal"` handling, log which model answered) implemented in `anthropicClient.ts`.
4. Env template `.env.example` with every var `env.ts` expects. No secrets.

Commit: `ring0: platform layer`.

## Phase C: Design tokens

`app/globals.css` with the Tailwind v4 `@theme` structure from `_ref/sobo-consulting/globals.css`, re-valued with spec §6.1 exactly: the ten Keystone tokens, nothing more. Fonts wired in `layout.tsx` via next/font: Cormorant Garamond, Plus Jakarta Sans, JetBrains Mono, exposed as CSS variables. Fluid type tokens and the eyebrow class per §6.2. `lib/motion.ts` copied with the single easing `cubic-bezier(0.22, 1, 0.36, 1)`. Reduced-motion gate on everything.

Commit: `ring0: design tokens`.

## Phase D: Operating docs

Author from the spec, not from generic templates:

- `CLAUDE.md`: standing orders 1 through 6 above, the `_ref/` read-only rule, the enforcement-model split (client surface pure-RLS with no-service-role guard; practice surface service-role-after-check), the per-feature gate checklist from the SOBO playbook, and the build model plan table (Ring 1 and Ring 3 plan on Fable 5 then execute on Sonnet; all other rings Sonnet; effort medium, check after every model switch).
- `SECURITY.md`: the two-level scope, both enforcement models, the transcript PII paragraph (storage behind the client wall, excluded from AI context except extraction, never logged, deletion path named), audit is metadata not values.
- `DESIGN.md`: §6 of the spec distilled: tokens, type registers, sidebar spec, motion vocabulary, 390px commitment, voice rules.
- `CURRENT.md`: state doc seeded with Ring 0 in progress, the ring queue, and the fourteen CONFIRM gates with their current status.

Commit: `ring0: operating docs`.

## Phase E: Agents

Create `.claude/agents/`:

- `quarry-scout.md`: model haiku, tools Read Grep Glob only, no Edit or Write. Job: locate and summarize patterns in the quarry repos and report the minimum needed, never dump whole files into the main context.
- `code-reviewer.md`: model sonnet, read-only. Job: review the current diff against `specs/keystone.md` and the per-feature gate in `CLAUDE.md`; report violations, do not fix.
- `rls-auditor.md`: model opus, read-only. Job: after any migration touching a scoped table, verify every table carries both `practice_id` and `client_id` where the spec requires, every RLS policy resolves scope from the authenticated user and never from a client-supplied id, and report any query path where the client dimension could drop.

Commit: `ring0: agents`.

## Phase F: CI gate scaffolds

Copy and adapt the three gates so they run (green on the empty schema) from day one:

1. `e2e/isolation.spec.ts`: extended from the Pathway seeded matrix to the two-level scope. The seed must include two practices, each with one client, and assert cross-practice AND cross-client reads return zero rows.
2. `e2e/isolation-coverage.spec.ts`: the enumeration ratchet with an empty `KNOWN_COVERAGE_GAPS`.
3. `e2e/config-integrity.spec.ts`: freezes the §6.1 tokens, asserts no hardcoded domains, and adds the voice check: fail on any em dash or banned word in shipped strings.
4. The no-service-role guard scoped to the client surface paths (`app/(client)/**` and its route handlers).

Commit: `ring0: gates`.

## Phase G: The preflight doc

Write `docs/keystone-preflight.md`. It opens with **FLAGS**: every place Phase A reality differed from the spec or the manifest, every assumption this prompt made that the repo contradicts, and anything in the spec Ring 1 should correct. Then the verification table from Phase A, the executed copy list with source-to-destination pairs, and open questions mapped to CONFIRM gate numbers.

Commit: `ring0: preflight findings`. Then stop. Ring 1 does not start until the FLAGS are reviewed and the spec is amended where the flags win.

## Definition of done for Ring 0

- `npm run build` passes on the empty shell.
- All three gates plus the no-service-role guard run and pass.
- Every file in the copy manifest either landed with its destination path logged, or is FLAGGED with a reason.
- No branch was pushed to any quarry repo; all commits landed in keystone only.
- The docs exist, are specific to Keystone, and contain no em dashes and no banned words.
