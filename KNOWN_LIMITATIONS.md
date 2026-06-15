# stem — Known Limitations & Demo Script

**stem** — *"Royalties that follow a work back through everyone who made it."*

A provenance-aware royalty platform on Arc Testnet. When a creative work is licensed via
USDC escrow, the released funds split automatically to **every** contributor in the work's
provenance chain — including **AI contributors**, who get their own Circle wallets and
ERC-8004 onchain identities. Every remix gives a fixed **20% upstream** to its parent chain
(recursively), so original creators keep earning from downstream remixes.

This is a **proof of concept**. The core thesis is demonstrated end-to-end on live infra
(Circle + Arc + Supabase + Anthropic). The list below is the honest gap between "working
PoC" and "production".

---

## Status: what's proven

Two full end-to-end runs executed live on Arc Testnet through the real app routes:

1. **Direct license** — a buyer licensed an original work (1 USDC); royalties split 50/50
   to a human creator and an **AI agent**. Both `royalty_payments` settled `COMPLETE`
   on-chain.
2. **Remix license** — a buyer licensed a 3-deep remix (10 USDC); the split paid the
   remixer 80% and sent **20% upstream** — 10% to the original human creator and 10% to the
   upstream **AI agent** — purely because their work sits upstream in the provenance chain.

The full escrow lifecycle (createJob → setBudget → approve → fund → submit → validate →
complete → split → reconcile → CLOSED) runs against the live ERC-8183 AgenticCommerce
contract, with real USDC moving between real Circle wallets.

---

## Known limitations (intentional PoC shortcuts)

### 1. Claude work-validation is currently auto-approving
The release step calls Anthropic Claude to validate that the delivered file is a coherent
creative work of its stated type. **The configured `ANTHROPIC_API_KEY` is out of credit**,
so the **graceful-degradation fallback** is what actually runs — it auto-approves and the
escrow still settles (the validation verdict records the reason). Top up the key and real
vision-based validation runs with **zero code change**.

### 2. Row-Level Security is disabled
RLS is off on all tables (inherited dev convention from the boilerplate). Acceptable for a
single-developer local demo; **must be enabled and policy-audited before any real users**.
The service-role key currently backs most server reads/writes.

### 3. Royalty reconciliation polls instead of using webhooks
Circle's transfer webhook can't reach `localhost`, so the app **reconciles pending royalty
payments on read** (GET poll of Circle transfer status, closing the license when all
transfers complete). A deployed public webhook endpoint replaces the polling.

### 4. Single hard-coded escrow agent wallet
One env-configured agent wallet (`NEXT_PUBLIC_AGENT_WALLET_*`) acts as provider **and**
evaluator for every escrow job. Fine for a demo; production would provision/scope agents
per job or per marketplace.

### 5. Testnet only
Runs on **Arc Testnet** (chainId 5042002), where USDC is the native gas token. No mainnet
path is wired, and faucet funding is manual (Circle's faucet drip API is unsupported for
Arc, so the "request USDC" button copies the address + opens the web faucet).

### 6. Provenance dilution is capped, not infinite
The 20% upstream rule flattens recursively at registration; ancestors whose resulting share
rounds below **0.01%** are dropped (the DB CHECK requires `split_pct > 0`). In practice a
chain stabilizes at ~6 upstream rows. This is a deliberate, dilution-safe design choice, not
a bug — but it means a very deep chain won't pay *every* distant ancestor a dust amount.

### 7. No automated test suite
Verification has been manual: `tsc --noEmit` clean, HTTP status checks, DB assertions, and
the two live end-to-end runs above. There are no unit/integration tests yet.

### 8. Auth/session hardening
Standard Supabase email auth from the boilerplate. No rate limiting, no email verification
gating on the demo accounts, and the demo was driven with admin-minted sessions.

---

## Demo script (≈5 minutes)

> Two accounts: **creator** `[EMAIL_ADDRESS]`, **buyer** `[EMAIL_ADDRESS]`.
> Make sure all wallets hold testnet USDC first (dashboard → "request USDC" → web faucet).

1. **Register a work** *(creator)* — Dashboard → "Register a work". Upload a music/art file,
   add contributors: yourself + an **AI agent** (pick one from your roster or create a new
   one — it mints a Circle wallet + ERC-8004 identity with a unique kawaii avatar). Set the
   split to 100%. → The work appears in the catalog and on the public **/explore** page.

2. **Browse as the public** *(logged out)* — Open **/explore** in a private window. Works are
   visible without login; each work page shows the contributor split and a "sign in to
   license" CTA.

3. **Buy a license** *(buyer)* — Sign in as the buyer, open the work, click **Buy a license**.
   Watch the status card walk through `createJob → setBudget → fund`. (You can't buy your
   own work; you can't double-buy one you already own — both are guarded.)

4. **Release & split** — Trigger release. The agent submits the deliverable, **Claude
   validates** it (currently auto-approved — see limitation #1), escrow completes, and the
   royalty **fans out to every contributor**, including the AI's wallet. The license closes.

5. **Make a remix** *(buyer)* — From a work you licensed, register a **remix**. The form
   auto-injects the parent's contributors scaled to a locked **20% upstream**, and sets you
   to 80%. Register it.

6. **Someone buys the remix** — As the *other* account, license the remix. → The split pays
   the remixer 80% and **20% flows back up the chain** to the original creators (human **and**
   AI). Show it in **/dashboard/earnings** → the "🌿 from remixes" total and the per-payment
   "downstream remix" tags.

7. **Show the receipts** — **/dashboard/earnings** (every royalty incl. AI agents),
   **/dashboard/library** (works you bought, playable inline), and the AI agent's **profile
   card** on **/dashboard/ai** (origin, ERC-8004 id, works contributed, total earned).

**The money shot:** an **AI agent autonomously receives USDC royalties** — both directly and
from a downstream remix it never touched — because the provenance chain pays it.

---

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 14 (App Router), Tailwind v4, shadcn |
| Data / Auth / Storage | Supabase (local Docker) |
| Wallets & Payments | Circle Developer-Controlled Wallets (SCA) |
| Chain | Arc Testnet — USDC native gas, ERC-8183 escrow, ERC-8004 identities, viem reads |
| AI validation | Anthropic Claude (`claude-opus-4-8`), structured JSON verdict |
