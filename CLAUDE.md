# CLAUDE.md

This file is read by Claude at the start of every Keystone session. Read it fully before writing code.

## Read first

- **`specs/keystone.md`**: the source of truth for the whole build. Read it in full before anything else.
- **`CURRENT.md`**: live state, the ring queue, and the CONFIRM gates. Read it at the start of every session.
- **`SECURITY.md`**: the security program and the per-feature gate. Cross-practice and cross-client isolation is the product's spine, not a feature.
- **`SOBO_PLAYBOOK.md`**: the cross-app method this repo instantiates.
- **`docs/keystone-preflight.md`**: the Ring 0 recon, opening with FLAGS where reality differed from the spec.

## Standing orders (these persist for the entire build)

1. The spec at `specs/keystone.md` is the source of truth. Read it in full before anything else.
2. `keystone` is the ONLY repository you write to. The four quarry repos (trellis, ambition-angels, team-esface, sobo-consulting) are read-only: read them, copy patterns into keystone, adapt. Never create a branch, commit, or push in any repository except keystone. (The Ring 0 prompt calls the quarries `_ref/`; in practice they are sibling checkouts in the session, same rule.)
3. One phase at a time. Each phase ends in a commit. Stop at each commit point, summarize what landed, and wait for approval before the next phase.
4. Diagnose before repair. If reality differs from the spec or the prompt, stop and flag it. Do not silently correct.
5. No em dashes anywhere: code comments, docs, strings, commit messages. No banned words (transformative, holistic, leverage, unlock, seamless, robust, pivotal).
6. Never invent content. If a source path, table, or pattern does not exist as described, log it as a FLAG; do not fabricate a substitute.

## What this is

Keystone, the client delivery platform for coaches and consultants. A practice (tenant one: SOBO Consulting) runs engagements for its clients (client one: SafeSpace); client members log in and see everything they are paying for in one place. Keystone holds the engagement; BloomOS holds the client's operation. The boundary table in spec section 2 is the standing answer to every scope question.

## Commands

```bash
npm run dev      # dev server at localhost:3000
npm run build    # production build
npx tsc --noEmit # typecheck
npm run lint     # eslint
npm test         # Playwright gates (e2e/): isolation, coverage ratchet, config integrity
```

## Stack

Next.js 16 (App Router, `src/` dir, TypeScript strict), Tailwind CSS v4 (tokens in an `@theme` block, no tailwind.config), Supabase (Postgres + RLS + Auth + Storage), Anthropic Claude API, Resend (email), Google Calendar API (Ring 2), Playwright (CI gates), Vercel.

Next 16 renamed middleware to proxy: the session-refresh file is `src/proxy.ts` (wired in Ring 1, helper in `src/lib/supabase/session.ts`). Check `node_modules/next/dist/docs/` before using routing or metadata APIs; do not assume training-data APIs.

## The two-level scope (the whole schema)

- **`practice_id`**: the top tenant. The boundary you sell across later.
- **`client_id`**: always under one practice. A client member sees only their own client's engagements, never another client of the practice, never another practice.

Every scoped table carries `practice_id` (denormalized even where derivable) so RLS never joins four tables deep and the isolation gate can assert it mechanically. Both ids are resolved server-side from the authenticated user via `src/lib/auth.ts` (`requirePracticeMember(role)`, `requireClientMember`). Never trust a scope id from the browser.

## The enforcement model (one per surface, explicit)

- **Client surface** (`app/(client)/**` and its route handlers): **pure RLS**. Anon key only; the no-service-role CI guard fails the build on any `supabaseAdmin` or service-role import there. The highest-risk surface, the one strangers log into, gets the hardest wall.
- **Practice surface** (`app/(practice)/**`): **service-role-after-check**. Resolve and verify practice membership, then act. RLS stays on as defense in depth.

One permission authority (`private.keystone_can`, Ring 1) is called by BOTH the RLS policies and the app's clean-403 checks so the two layers cannot drift.

## Key platform files

- `src/lib/supabase.ts` (anon, browser) and `src/lib/supabaseAdmin.ts` (service role, lazy proxy, written contract; the single chokepoint)
- `src/lib/auth.ts`: the two resolvers
- `src/lib/claudeModel.ts`: the ONLY task-to-model map; `src/lib/anthropicClient.ts`: the one AI chokepoint (spend guard, cost ledger, refusal fallback contract)
- `src/lib/spend.ts`: per-practice ceilings plus the per-engagement cost ledger
- `src/lib/rateLimit.ts`: durable sliding window; every auth and generation endpoint is limited
- `src/lib/voice.ts` + `src/lib/voiceViolations.ts`: the voice gate at every AI boundary
- `src/lib/audit.ts`: append-only, metadata never values
- `src/lib/email.ts`: Resend, degrades honestly (no fake success)

## AI rules

Exactly four inert propose-then-accept jobs (transcript extraction, digest draft, resource suggestion, engagement Q&A) plus the voice sweep. Every AI write lands in `ai_proposals`, never a live table; a single human accept route is the only path into the system of record. Q&A answers only from that engagement's own record. Model tiers: extraction on `claude-opus-4-8`, digest and Q&A on `claude-sonnet-5`, suggestion and voice sweep on `claude-haiku-4-5-20251001`; `claude-fable-5` is declared but wired to no job. The fallback contract lives in `anthropicClient.ts`: on `stop_reason: "refusal"`, retry once on the declared fallback model and log which model answered.

## The per-feature gate (every PR; from SOBO_PLAYBOOK.md section 10)

- New scoped table: carries `practice_id` (and `client_id` where required), membership RLS, and a cross-practice AND cross-client isolation test in the SAME PR. Global reference tables are the documented exception (no scope id, SELECT to authenticated, no write policy, carved out in the gate).
- New route: validates auth, resolves scope server-side, every query scoped, service role only after the check (or pure RLS on the client surface).
- New person-data: minimized, on the right wall, no cross-AI-scope leak. Transcripts per SECURITY.md.
- New AI surface: untrusted, rate-limited, spend-capped (cost ledger), inert `ai_proposals` output, voice-swept at the boundary.
- Secrets in env or an AES-256-GCM deny-all table; no PII in logs (metadata only).
- Copy and AI output: no em dashes, voice rules hold, growth described, never scored.
- Mobile surface: verified at 390px. Shipped = deployed plus one real 390px run, not just merged.

## Build model plan

| Ring | Plan | Execute | Notes |
|---|---|---|---|
| Ring 1 (spine, RLS, isolation matrix) | Fable 5 | Sonnet | Plan on Fable 5, then execute on Sonnet |
| Ring 2 (sessions, calendar) | Sonnet | Sonnet | |
| Ring 3 (notes, AI extraction, homework) | Fable 5 | Sonnet | Plan on Fable 5, then execute on Sonnet |
| Ring 3.5 (Practice Home) | Sonnet | Sonnet | |
| Ring 4 (deliverables, library) | Sonnet | Sonnet | |
| Ring 5 (messages) | Sonnet | Sonnet | |
| Ring 6 (digest) | Sonnet | Sonnet | |

Effort medium. After every model switch, re-read `CURRENT.md` and check the working state (branch, last commit, open FLAGS) before continuing.

## Design

See `DESIGN.md`. Ten tokens frozen by the config-integrity gate; three type registers; the 264px/72px sidebar that transforms to a bottom tab bar at 390px; one easing; voice rules in every shipped string.
