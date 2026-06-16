# TODO / Known follow-ups

Running list of deferred work and known limitations, so they can be retraced
later. Add new items under a dated heading with: **context**, **why it matters**,
**options / next steps**, and the **relevant files**.

---

## Streaming payments (Mode 1)

### Audio is auth-gated, not payment-gated  · _added 2026-06-16_
**Context:** Audio bytes now live in a private `stems` bucket and are served only
via short-lived (60s) signed URLs minted by `GET /api/works/[id]/audio-url` for
**authenticated** users. This stops anonymous/public access and casual
URL-sharing.

**Why it matters:** It does **not** payment-gate the bytes. Any *signed-in* user
can call the endpoint and receive a working 60s link, and a signed URL grants
full-file fetch for its lifetime. The per-minute charge and the 60s-free preview
limit are enforced **client-side** by the player (as acknowledged when the
feature was scoped). So a determined logged-in user could pull the audio without
paying.

**Options / next steps:**
- Gate `audio-url` on an active, funded stream session (refuse/limit URLs when
  the listener's pocket can't cover continued listening).
- For true byte-level metering, move to segment-level signed URLs (HLS/MSE) so
  access is granted per chunk rather than per whole file. Larger change.

**Relevant files:** `app/api/works/[id]/audio-url/route.ts`,
`components/streaming-audio-player.tsx`, `components/audio-player.tsx`,
`supabase/migrations/20260616120000_stems_private.sql`.

---

## Instant licensing

### Partial-payment risk on instant license split  · _added 2026-06-16_
**Context:** Buying a derivative license pays each contributor in a sequential loop of direct
Circle transfers (`purchaseInstant` in `app/services/license.service.ts`).

**Why it matters:** If one transfer fails mid-loop, earlier contributors are already paid and
the license is marked `FAILED` with **no auto-refund** — funds can be partially disbursed.
Rare on testnet with sufficient balance, but not atomic.

**Options / next steps:** Pre-flight all transfers, or refund/retry on partial failure, or
route through a single batched payout. Re-introducing a pre-payment validation gate (dropped
with escrow) could also live here.

**Relevant files:** `app/services/license.service.ts`, `app/api/licenses/route.ts`.

### Client-reported listening seconds are trusted  · _added 2026-06-16_
**Context:** Per-minute charges are driven by `secondsPlayed` reported from the
browser to `POST /api/works/[id]/stream`.

**Why it matters:** The server clamps to monotonic minutes and caps a single
heartbeat to 20 minutes, but a crafted client could still under-report (pay less)
or over-report.

**Options / next steps:** Cross-check against wall-clock between heartbeats and
against `works.duration_seconds`; consider server-side playback tokens.

**Relevant files:** `app/api/works/[id]/stream/route.ts`,
`app/services/streaming.service.ts`.

### Signed-URL refresh causes a brief stall on long tracks  · _added 2026-06-16_
**Context:** When a 60s signed URL expires mid-playback, the player re-signs on
the media `error` event and resumes from the saved position.

**Why it matters:** For tracks longer than ~60s that aren't fully buffered, this
can produce a short audible stall at the refresh point. Short stems that buffer
fully within the URL's lifetime are unaffected.

**Options / next steps:** Longer expiry for owned/library playback, or HLS/MSE
segment URLs for gap-free rotation.

**Relevant files:** `components/audio-player.tsx`, `components/licensed-audio.tsx`.

---

## Operational

### Apply pending Supabase migrations  · _added 2026-06-16_
**Context:** The streaming feature added migrations that must be applied to the
database before it works end-to-end:
- `20260616000000_streaming_payments.sql` (pockets / sessions / ledger + RPC)
- `20260616120000_stems_private.sql` (makes the audio bucket private)

**Why it matters:** Until applied, streaming calls error on missing tables, and
audio bytes remain publicly accessible (bucket still public).

**Note:** The bundled Supabase CLI (`supabase@2.2.1`) errors on
`db.major_version: 17`, so apply via the dashboard SQL editor or a CLI build that
supports PG17.

---

## Future work

### Mode 2 — x402 external-wallet streaming  · _added 2026-06-16_
**Context:** Mode 1 (internal pocket) is built; Mode 2 is not started.

**Next steps:** Audio endpoint returns HTTP 402, support MetaMask / Coinbase
Wallet signing. Read the `circlefin/arc-nanopayments` reference first. No
external-wallet/signing scaffolding exists yet; `@circle-fin/x402-batching` is a
dependency but unused. The `/api/works/[id]/stream` route is shaped so the 402
path can slot in.
