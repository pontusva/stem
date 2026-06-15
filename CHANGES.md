# CHANGES — Modifications from the original work

This repository is a derivative work. This file documents the modifications made to the
original, as required by the Apache License, Version 2.0, Section 4(b) ("You must cause any
modified files to carry prominent notices stating that You changed the files").

## Original work

- **Name:** Workflow Escrow Refund Protocol (Circle sample application)
- **Copyright:** Copyright 2026 Circle Internet Group, Inc. All rights reserved.
- **License:** Apache License, Version 2.0 (see `LICENSE`)
- **Description (original README):** "Automate escrow-backed freelance agreements with
  AI-powered work validation using USDC on Arc testnet … Next.js, Supabase, Circle Developer
  Controlled Wallets, and OpenAI … from contract creation and deposit, through AI-validated
  deliverable submission, to fund release or refund."

## Derivative work

- **Name:** stem — provenance-aware creative-works royalty platform
- **Nature of change:** the escrow / Circle / Supabase / Arc infrastructure from the original
  is **retained and reused**. The application domain was changed from *freelance escrow with
  refunds* to *creative-works licensing with provenance-based royalty splitting*, the AI
  provider was changed from **OpenAI to Anthropic Claude**, and a new domain model, API
  surface, and UI were added on top.

All original Apache 2.0 license headers are retained in the files that carry them. New files
created for stem are likewise licensed under Apache 2.0 and note their authorship. The
original `LICENSE` is unchanged and continues to govern this repository.

---

## Summary of changes vs. the original (initial commit `5145560`)

### Changed: AI provider — OpenAI → Anthropic Claude
- Removed OpenAI-based deliverable validation; added Anthropic Claude validation.
- **New:** `lib/utils/anthropicClient.ts` (`claude-opus-4-8`, structured JSON verdict).
- Validation degrades gracefully (auto-approves) if the AI call fails, so escrow can settle.

### Changed: domain model — escrow agreements → works / contributors / royalties
- **New migration** `supabase/migrations/20260611200000_royalty_schema.sql` — adds
  `works`, `contributors`, `licenses`, `royalty_payments`; a public `works-files` storage
  bucket; realtime on the new tables; relaxes `wallets.profile_id` to nullable.
- **New migration** `supabase/migrations/20260612120000_ai_agents.sql` — extends `wallets`
  into first-class AI agents (`is_ai`, `display_name`, `origin`, `capabilities`,
  `created_by_profile_id`, `erc8004_agent_id`, `erc8004_tx_hash`); backfills pre-existing
  AI wallets.
- **New:** `types/royalty.ts` (modified), provenance/earnings/agent types.

### New: provenance royalty engine
- **New:** `lib/utils/royalty.ts` — split-amount computation (dust-aware), the fixed **20%
  upstream rule** (`scaleUpstreamSplits`, recursive, dilution-safe), validation helpers.
- **New:** `lib/utils/arc.ts` — Arc Testnet constants, viem public client, USDC unit
  helpers, Circle-tx waiter, ERC-8183 ABI, job/agent-id extraction from tx receipts.

### New: AI agents as first-class, reusable, onchain identities
- **New:** `app/services/ai-agent.service.ts` (create-or-get with name dedupe, list w/ stats).
- **New:** `app/api/ai-agents/route.ts` (GET roster, POST create-or-reuse).
- **Removed:** `app/api/ai-wallet/route.ts` (superseded — it minted a new wallet every call).
- **New:** `components/ai-agent-card.tsx`, `components/create-ai-agent-dialog.tsx`,
  `components/kawaii/kawaii-ai-avatar.tsx` (deterministic per-agent avatars),
  `app/dashboard/ai/page.tsx`.

### New: royalty / licensing flow on top of escrow
- **Modified:** `app/api/licenses/route.ts` (create license + ERC-8183 createJob/setBudget;
  owner-can't-buy guard; no-double-buy guard), `app/api/licenses/[id]/fund/route.ts`
  (idempotent approve+fund with on-chain self-heal), `app/api/licenses/[id]/route.ts`
  (reconcile pending payments on read).
- **New:** `app/api/licenses/[id]/release/route.ts` (submit → Claude validate → complete →
  fan-out royalties).
- **Modified:** `app/services/license.service.ts` (createLicense, status, reconcile,
  `fanOutRoyalties`), `app/api/webhooks/circle/route.ts` (royalty transfer reconciliation).

### New: works, marketplace, library, earnings
- **New:** `app/services/works.service.ts` (modified — listWorks w/ stats, provenance chain,
  downstream stats), `app/services/earnings.service.ts`.
- **New:** `app/api/works/route.ts` / `app/api/works/[id]/route.ts` (modified),
  `app/api/works/[id]/contributors/route.ts`, work-file routes.
- **New pages:** `app/works/[id]/page.tsx` (public, auth-aware work page),
  `app/explore/page.tsx` (public marketplace), `app/dashboard/library/page.tsx`,
  `app/dashboard/earnings/page.tsx`, `app/dashboard/works/new/page.tsx`,
  `app/dashboard/works/[id]/page.tsx`, `app/dashboard/licenses/[id]/page.tsx`.
- **New components:** `register-work-form.tsx`, `contributor-split-editor.tsx`,
  `work-card.tsx`, `works-catalog.tsx`, `provenance-chain.tsx`, `royalty-breakdown.tsx`,
  `license-work-button.tsx`, `license-status-card.tsx`, `work-file-upload.tsx`,
  `share-work-button.tsx`.

### New: kawaii UI redesign
- **Modified:** `app/globals.css` (Nunito, cloud/blue/lavender/blush palette, dreamy
  gradients, rounded radii, soft shadows, animations), `app/layout.tsx`,
  `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `components/header-auth.tsx`,
  `components/hero.tsx`, dashboard.
- **New:** `components/kawaii/*` (StemCloud mascot, KawaiiNote, KawaiiWallet, KawaiiAI,
  KawaiiAIAvatar, SparkleDecoration, EmptyState, LoadingCloud).

### Other
- **New:** `register-entity-secret.mjs` (one-time Circle entity-secret registration helper).
- **New:** `ROYALTY_PROTOCOL.md` (protocol notes), `KNOWN_LIMITATIONS.md` (this PoC's gaps +
  demo script).
- **Modified:** `components/request-usdc-button.tsx` (Arc faucet has no drip API — now copies
  address + opens the web faucet), `components/sw-killer.tsx` (clears stale service workers),
  `tsconfig.json` (target ES2020, moduleResolution bundler — required by viem),
  `environment.d.ts`, `.gitignore`, `package.json` (added `@anthropic-ai/sdk`, `viem`).

---

*This document is informational and is provided to satisfy Apache 2.0 §4(b). It does not
alter the terms of the `LICENSE`, which continues to govern all use of this repository.*
