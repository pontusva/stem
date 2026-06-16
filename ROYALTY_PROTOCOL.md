# Royalty Protocol

Provenance-aware royalties on **Arc Testnet**. Register a creative work, define
who made it — humans *and* AI — and money reaches every contributor by their
split. AI contributors get their own Circle wallet **and** an ERC-8004 onchain
identity, and earn USDC like anyone else.

Built on the Circle Arc boilerplate (Next.js + Supabase + Circle
Developer-Controlled Wallets). All payments are Circle wallet-to-wallet USDC
transfers on Arc.

## Two ways money flows to creators

1. **Derivative license — instant direct payment.** Buying a license charges the
   buyer's Circle wallet and **splits it instantly** to every contributor by
   `split_pct` (one wallet-to-wallet transfer each). The license is granted
   immediately and unlocks **download + remix rights**. There is **no escrow** —
   no create/fund/submit/release steps. (Earlier versions used an ERC-8183
   escrow job; that flow was removed in favour of instant payment.)
2. **Streaming — pay-per-listen (Mode 1, internal pocket).** Listeners pre-fund
   an internal **pocket** (one on-chain top-up: their wallet → the Stem agent
   wallet) and are charged **$0.001/min** as they listen, debited off-chain and
   credited to each contributor's pocket. Contributors **withdraw** their pocket
   on-chain when they choose. Owners, contributors, and **valid license holders
   stream free**.

The fixed **20% upstream rule** applies to both: a remix sends 20% of every
license/stream up its provenance chain (recursively) to ancestor creators.

## Architecture

| Layer | What it does |
| --- | --- |
| `works`, `contributors` | A work and its human/AI contributors with royalty `split_pct` (sum = 100%). AI contributor wallets live in `wallets` with `profile_id = NULL`. |
| `licenses` | One row per derivative license. Granted instantly (`CLOSED`) after the direct split payment. |
| `royalty_payments` | One row per contributor per license; the direct transfer is recorded `COMPLETE`. |
| `pockets`, `stream_sessions`, `pocket_ledger` | Streaming pay-per-listen: internal balances, metered sessions, and an append-only movement ledger. |

### Storage

- **`works-files`** (public) — images / PDFs / text.
- **`stems`** (private) — audio. Served only via short-lived (60s) **signed URLs**
  minted server-side for authenticated users (`GET /api/works/[id]/audio-url`);
  the player refreshes them and `?download=1` forces an attachment.

### Arc Testnet contracts (see `lib/utils/arc.ts`)

```
USDC                 0x3600000000000000000000000000000000000000
ERC-8004 identity    0x8004A818BFB912233c491871b3d84c89A494BD9e
```

(The ERC-8183 AgenticCommerce escrow contract is no longer used for licensing.)

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/ai-agents` · `GET /api/ai-agents` | Create-or-reuse an AI contributor (Circle wallet + ERC-8004 identity) / list roster |
| `POST /api/works` · `GET /api/works` | Register / list works |
| `POST /api/works/[id]/file` | Upload the work file (audio → private `stems`, else public `works-files`) |
| `POST /api/works/[id]/contributors` | Attach contributors + splits (validates 100%) |
| `GET /api/works/[id]` | Work + contributors + provenance chain |
| `GET /api/works/[id]/audio-url` | Mint a short-lived signed audio URL (auth only; `?download=1` to download) |
| `POST /api/works/[id]/stream` | Streaming heartbeat — charges $0.001 per completed minute, splits to contributors (owner/contributor/licensee free) |
| `POST /api/licenses` | **Instant** buy — balance check → direct split to all contributors → grant license |
| `GET /api/licenses` · `GET /api/licenses/[id]` | List licenses / license receipt + per-contributor split |
| `GET /api/pocket` | Pocket balance + recent ledger (own + AI-agent wallets) |
| `POST /api/pocket/topup` | On-chain top-up (buyer wallet → agent custodian) to fund listening |
| `POST /api/pocket/withdraw` | Withdraw streaming earnings on-chain (agent → your wallet) |

## License lifecycle (status)

```
INITIATED → CLOSED        (instant direct payment succeeded)
INITIATED → FAILED        (a payout leg failed)
```

## Setup

Follow the base `README.md` for Supabase + Circle setup, then:

1. `cp .env.example .env.local` and fill in everything, including
   **`SUPABASE_SERVICE_ROLE_KEY`** (server-side privileged writes + storage).
2. `npx supabase start && npx supabase migration up` — applies the royalty
   schema, the `stems` audio bucket (private), and the streaming-payments schema.
3. `npm run generate-wallet` — creates the **agent wallet** (the pocket
   custodian) and writes `NEXT_PUBLIC_AGENT_WALLET_ID` / `_ADDRESS` into
   `.env.local`.
4. **Fund the agent wallet** with Arc Testnet USDC from
   <https://faucet.circle.com> — on Arc, gas is paid in USDC, and the agent
   wallet pays gas for ERC-8004 `register`, streaming-pocket payouts, and
   withdrawals.
5. `npm run dev` and sign up. Use the dashboard's **Request USDC** (dev only) to
   fund your own wallet so you can license and stream.

## Demo script

1. **Register a work** with two contributors — yourself + an **AI contributor**
   (e.g. "GPT-4o Composer") at e.g. 70/30. On submit, the AI gets a Circle
   wallet and an ERC-8004 identity (linked on Arcscan from the work page).
2. From a second account, open the work and **Buy license** → confirm. The
   $price is split **instantly** — 70% to you, 30% to the AI wallet — and the
   buyer immediately gets **download + remix**.
3. **Stream it** as a third (unlicensed) signed-in user: a 30s preview, then
   per-minute charges from their pocket float to the contributors. Watch
   `/dashboard/earnings` → streaming pocket. Owners, contributors, and the
   license holder stream **free**.
4. **Register a derivative** linking to the original to show the provenance
   chain and the 20% upstream split.
