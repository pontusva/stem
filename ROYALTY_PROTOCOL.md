# Royalty Protocol

Provenance-aware royalties on **Arc Testnet**. Register a creative work, define
who made it — humans *and* AI — and when the work is licensed via escrow, the
released USDC fans out to every contributor by their split. AI contributors get
their own Circle wallet **and** an ERC-8004 onchain identity, and earn USDC like
anyone else.

Built on the Circle Arc escrow boilerplate (Next.js + Supabase + Circle
Developer-Controlled Wallets). The escrow itself uses the already-deployed
**ERC-8183 AgenticCommerce** job contract; royalty fan-out uses Circle
wallet-to-wallet USDC transfers.

## Architecture

| Layer | What it does |
| --- | --- |
| `works`, `contributors` | A work and its human/AI contributors with royalty `split_pct` (sum = 100%). AI contributor wallets live in `wallets` with `profile_id = NULL`. |
| `licenses` | One ERC-8183 escrow job per license. The agent wallet is on-chain `provider` + `evaluator`. |
| `royalty_payments` | One row per contributor per release; tracks each Circle transfer to COMPLETE. |

### Arc Testnet contracts (see `lib/utils/arc.ts`)

```
USDC                 0x3600000000000000000000000000000000000000
ERC-8183 commerce    0x0747EEf0706327138c69792bF28Cd525089e4583
ERC-8004 identity    0x8004A818BFB912233c491871b3d84c89A494BD9e
```

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/ai-wallet` | Create a Circle wallet for an AI contributor + register an ERC-8004 identity |
| `POST /api/works` · `GET /api/works` | Register / list works |
| `POST /api/works/[id]/file` | Upload the work file (public `works-files` bucket) |
| `POST /api/works/[id]/contributors` | Attach contributors + splits (validates 100%) |
| `GET /api/works/[id]` | Work + contributors + provenance chain |
| `POST /api/licenses` | Create license → `createJob` (buyer) + `setBudget` (agent) |
| `POST /api/licenses/[id]/fund` | `approve` + `fund` (buyer) — escrows USDC |
| `POST /api/licenses/[id]/release` | `submit` (agent) → AI validate → `complete` (agent) → fan out royalties |
| `GET /api/licenses/[id]` | License + per-contributor payout status |
| `POST /api/webhooks/circle` | Marks each royalty transfer COMPLETE; closes the license when all settle |

## License lifecycle (status)

```
INITIATED → JOB_CREATED → BUDGETED → APPROVED → FUNDED
          → SUBMITTED → COMPLETED → SPLITTING → CLOSED
```

## Setup

Follow the base `README.md` for Supabase + Circle setup, then:

1. `cp .env.example .env.local` and fill in everything, including the new
   **`SUPABASE_SERVICE_ROLE_KEY`** (server-side privileged writes + storage).
2. `npx supabase start && npx supabase migration up` — applies the royalty
   schema (`supabase/migrations/20260611200000_royalty_schema.sql`).
3. `npm run generate-wallet` — creates the **agent wallet** and writes
   `NEXT_PUBLIC_AGENT_WALLET_ID` / `_ADDRESS` into `.env.local`.
4. **Fund the agent wallet** with Arc Testnet USDC from
   <https://faucet.circle.com> — on Arc, gas is paid in USDC, and the agent
   wallet pays gas for `setBudget`, `submit`, `complete`, ERC-8004 `register`,
   and every royalty transfer.
5. `npm run dev` and sign up. Use the dashboard's **Request USDC** (dev only) to
   fund your own wallet so you can license works.

## Demo script

1. **Register a work** with two contributors — yourself + an **AI contributor**
   (e.g. "GPT-4o Composer") at e.g. 70/30. On submit, the AI gets a Circle
   wallet and an ERC-8004 identity (linked on Arcscan from the work page).
2. From a second account, open the work and **License this work** — this creates
   and budgets the ERC-8183 job on Arc.
3. **Fund escrow** (buyer), then **Validate work & release royalties**. The agent
   receives the escrow, then USDC fans out: 70% to you, 30% to the AI wallet —
   watch the payout statuses flip to COMPLETE live.
4. **Register a derivative** linking to the original to show the provenance chain.
