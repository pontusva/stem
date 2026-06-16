# stem — Known Limitations & Demo Script

**stem** — *"Royalties that follow a work back through everyone who made it."*

A provenance-aware royalty platform on Arc Testnet. Money reaches **every** contributor two
ways: buying a **license** pays an **instant direct split** to all contributors (no escrow),
and **streaming** charges listeners **$0.001/min** that floats to contributors via an
internal pocket. Both honour a fixed **20% upstream** to the parent chain (recursively) —
including **AI contributors**, who get their own Circle wallets and ERC-8004 onchain
identities. Owners, contributors, and valid license holders stream free.

This is a **proof of concept**. The core thesis is demonstrated end-to-end on live infra
(Circle + Arc + Supabase + Anthropic). The list below is the honest gap between "working
PoC" and "production".

---

## Status: what's proven

Run live on Arc Testnet through the real app routes, with real USDC moving between real
Circle wallets:

1. **Instant license** — buying a license charges the buyer's wallet and **splits it
   directly** to every contributor (human + **AI agent**) by their share; each
   `royalty_payment` records `COMPLETE` and the license is granted immediately.
2. **Remix upstream** — a remix split pays the remixer 80% and sends **20% upstream** to the
   ancestor creators (human and AI), purely from their position in the provenance chain.
3. **Streaming pay-per-listen** — listeners pre-fund a pocket and are metered $0.001/min;
   the charge debits their pocket and credits each contributor's pocket; contributors
   withdraw on-chain.

Licensing is a direct wallet-to-wallet split (the earlier ERC-8183 escrow lifecycle was
removed); streaming movement is an internal ledger settled on top-up / withdrawal.

---

## Known limitations (intentional PoC shortcuts)

### 1. No work-validation gate on purchase
The old escrow flow ran an Anthropic Claude check before releasing funds. That gate lived in
the (now removed) release route, so **instant licensing pays and grants without validation**.
Re-introducing a validation step (e.g. before the split) is a deliberate future choice, not
wired today.

### 2. Row-Level Security is disabled
RLS is off on all tables (inherited dev convention from the boilerplate). Acceptable for a
single-developer local demo; **must be enabled and policy-audited before any real users**.
The service-role key currently backs most server reads/writes.

### 3. Payments settle synchronously (no webhook)
License splits and pocket withdrawals wait on each Circle transfer inline (`waitForCircleTx`,
sub-second on Arc) rather than via a webhook, so `royalty_payments` are `COMPLETE` on return.
A deployed public webhook endpoint would let payouts settle asynchronously at scale.

### 4. Single hard-coded agent / custodian wallet
One env-configured agent wallet (`NEXT_PUBLIC_AGENT_WALLET_*`) is the **streaming pocket
custodian** (it holds pooled pre-funded balances and pays out withdrawals). Licensing pays
contributors directly from the buyer's wallet and doesn't route through it. Fine for a demo;
production would scope/segregate custody.

### 4a. Instant-license partial-payment risk
Each license pays contributors in a sequential loop. If one transfer fails mid-loop, earlier
contributors are already paid and the license is marked `FAILED` with **no auto-refund**.
Rare on testnet with sufficient balance; noted for hardening.

### 4b. Audio is auth-gated, not payment-gated
Audio lives in a private bucket served via short-lived signed URLs, but any **authenticated**
user can mint one — per-minute billing and the 30s preview are enforced client-side. See
`TODO.md`.

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

3. **Buy a license** *(buyer)* — Sign in as the buyer, open the work, click **Buy license**,
   confirm. The price is **split instantly** to every contributor (incl. the AI's wallet) —
   no escrow, no waiting — and the buyer immediately unlocks **download + remix**. (You can't
   buy your own work; you can't double-buy one you already own — both are guarded.)

4. **Stream it** *(a third, unlicensed account)* — Open the work and play. After a 30s
   preview, top up the pocket and keep listening; **$0.001/min** floats to the contributors
   (watch `/dashboard/earnings` → streaming pocket, then **withdraw**). Owners, contributors,
   and the license holder stream **free**.

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
| Payments | Instant direct license split + streaming pay-per-listen (internal pocket ledger) |
| Chain | Arc Testnet — USDC native gas, ERC-8004 identities, viem reads |
| AI | Anthropic Claude (`claude-opus-4-8`) — used for AI-contributor flows |
