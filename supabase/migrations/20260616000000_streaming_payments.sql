-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- =====================================================================
-- Streaming payments — Mode 1: internal "pocket" balance ledger.
--
-- Pay-per-listen: a signed-in listener tops up a pocket once (on-chain,
-- their Circle wallet -> the Stem agent wallet which custodies pooled
-- funds), then is debited $0.001 per completed minute of listening. Each
-- contributor's split accrues in *their* pocket; contributors withdraw
-- on-chain when they choose. All per-minute movement is off-chain (DB).
--
-- Access-control mirrors the royalty schema: SELECT-only policies scoped
-- to the owning party; every write happens server-side via service_role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- pockets: one internal USDC balance per wallet (listener or contributor).
-- The agent wallet holds the pooled funds on-chain; this is the ledger of
-- who owns what. NOT the same as wallets.balance (cached Circle balance).
-- ---------------------------------------------------------------------
CREATE TABLE pockets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id    UUID NOT NULL UNIQUE REFERENCES wallets(id) ON DELETE CASCADE,
    profile_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL for AI wallets
    balance_usdc NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (balance_usdc >= 0),
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pockets_profile_id ON pockets(profile_id);

-- ---------------------------------------------------------------------
-- stream_sessions: one row per (listener, work) listening session.
-- minutes_charged is monotonic; the server only ever charges the delta.
-- ---------------------------------------------------------------------
CREATE TABLE stream_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id             UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    listener_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    listener_wallet_id  UUID NOT NULL REFERENCES wallets(id),
    seconds_played      INTEGER NOT NULL DEFAULT 0,
    minutes_charged     INTEGER NOT NULL DEFAULT 0,
    amount_charged_usdc NUMERIC(20, 6) NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | ENDED
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stream_sessions_listener ON stream_sessions(listener_profile_id);
CREATE INDEX idx_stream_sessions_work ON stream_sessions(work_id);

-- ---------------------------------------------------------------------
-- pocket_ledger: append-only record of every pocket movement. Powers the
-- earnings feed and audit. amount_usdc is signed (+credit / -debit).
-- ---------------------------------------------------------------------
CREATE TABLE pocket_ledger (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id             UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    profile_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    entry_type            TEXT NOT NULL,   -- TOPUP | STREAM_DEBIT | STREAM_CREDIT | WITHDRAWAL
    amount_usdc           NUMERIC(20, 6) NOT NULL,
    work_id               UUID REFERENCES works(id) ON DELETE SET NULL,
    stream_session_id     UUID REFERENCES stream_sessions(id) ON DELETE SET NULL,
    counterparty_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    circle_transfer_id    TEXT,            -- set for on-chain legs (TOPUP/WITHDRAWAL)
    status                TEXT NOT NULL DEFAULT 'COMPLETE',  -- PENDING | COMPLETE | FAILED
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pocket_ledger_wallet ON pocket_ledger(wallet_id);
CREATE INDEX idx_pocket_ledger_profile ON pocket_ledger(profile_id);
CREATE INDEX idx_pocket_ledger_session ON pocket_ledger(stream_session_id);

-- ---------------------------------------------------------------------
-- updated_at triggers (reuse the helper from the initial schema)
-- ---------------------------------------------------------------------
CREATE TRIGGER update_pockets_updated_at
    BEFORE UPDATE ON pockets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stream_sessions_updated_at
    BEFORE UPDATE ON stream_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- Atomic per-minute charge. Splits are computed in TS (computeSplitAmounts)
-- and passed as p_credits = [{wallet_id, profile_id, amount}]. In ONE
-- transaction: lock + check the listener pocket, debit it, credit each
-- contributor pocket (upserting a pocket row), append ledger rows, and bump
-- the session counters. Raises INSUFFICIENT_POCKET when funds fall short so
-- the caller can pause playback. SECURITY DEFINER: only service_role runs it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.charge_stream_minutes(
    p_session_id uuid,
    p_minutes    int,        -- new cumulative minutes_charged
    p_cost       numeric,    -- cost of the newly-charged delta minutes
    p_seconds    int,        -- latest cumulative seconds_played
    p_credits    jsonb       -- [{ wallet_id, profile_id, amount }]
)
RETURNS numeric             -- the listener's new pocket balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session         stream_sessions%ROWTYPE;
    v_listener_wallet uuid;
    v_listener_prof   uuid;
    v_balance         numeric;
    v_credit          jsonb;
BEGIN
    SELECT * INTO v_session FROM stream_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'stream session % not found', p_session_id;
    END IF;
    v_listener_wallet := v_session.listener_wallet_id;
    v_listener_prof   := v_session.listener_profile_id;

    -- Lock and check the listener's pocket.
    SELECT balance_usdc INTO v_balance
        FROM pockets WHERE wallet_id = v_listener_wallet FOR UPDATE;
    IF v_balance IS NULL OR v_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_POCKET';
    END IF;

    -- Debit the listener.
    UPDATE pockets
        SET balance_usdc = balance_usdc - p_cost, updated_at = now()
        WHERE wallet_id = v_listener_wallet
        RETURNING balance_usdc INTO v_balance;

    INSERT INTO pocket_ledger
        (wallet_id, profile_id, entry_type, amount_usdc, work_id, stream_session_id, status)
        VALUES (v_listener_wallet, v_listener_prof, 'STREAM_DEBIT', -p_cost,
                v_session.work_id, p_session_id, 'COMPLETE');

    -- Credit each contributor (upsert their pocket).
    FOR v_credit IN SELECT * FROM jsonb_array_elements(p_credits)
    LOOP
        INSERT INTO pockets (wallet_id, profile_id, balance_usdc)
            VALUES ((v_credit->>'wallet_id')::uuid,
                    NULLIF(v_credit->>'profile_id', '')::uuid,
                    (v_credit->>'amount')::numeric)
            ON CONFLICT (wallet_id) DO UPDATE
                SET balance_usdc = pockets.balance_usdc + EXCLUDED.balance_usdc,
                    updated_at = now();

        INSERT INTO pocket_ledger
            (wallet_id, profile_id, entry_type, amount_usdc, work_id,
             stream_session_id, counterparty_wallet_id, status)
            VALUES ((v_credit->>'wallet_id')::uuid,
                    NULLIF(v_credit->>'profile_id', '')::uuid,
                    'STREAM_CREDIT', (v_credit->>'amount')::numeric,
                    v_session.work_id, p_session_id, v_listener_wallet, 'COMPLETE');
    END LOOP;

    -- Advance the session counters (minutes_charged is monotonic).
    UPDATE stream_sessions
        SET minutes_charged     = p_minutes,
            amount_charged_usdc = amount_charged_usdc + p_cost,
            seconds_played      = GREATEST(seconds_played, p_seconds),
            updated_at          = now()
        WHERE id = p_session_id;

    RETURN v_balance;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS: SELECT-only, scoped to the owning party (or work owner). All writes
-- go through service_role, which bypasses RLS.
-- ---------------------------------------------------------------------
ALTER TABLE pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pocket_ledger ENABLE ROW LEVEL SECURITY;

-- Pockets: visible to the wallet's owner or its AI-agent creator.
CREATE POLICY "pockets_select" ON pockets
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM wallets w
            WHERE w.profile_id = public.current_profile_id()
               OR w.created_by_profile_id = public.current_profile_id()
        )
    );

-- Pocket ledger: same wallet-ownership scope.
CREATE POLICY "pocket_ledger_select" ON pocket_ledger
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM wallets w
            WHERE w.profile_id = public.current_profile_id()
               OR w.created_by_profile_id = public.current_profile_id()
        )
    );

-- Stream sessions: the listener or the work owner.
CREATE POLICY "stream_sessions_select" ON stream_sessions
    FOR SELECT USING (
        listener_profile_id = public.current_profile_id()
        OR EXISTS (SELECT 1 FROM works wk
                   WHERE wk.id = stream_sessions.work_id
                     AND wk.owner_profile_id = public.current_profile_id())
    );

-- ---------------------------------------------------------------------
-- Grants (mirror the royalty schema) + lock the SECURITY DEFINER function
-- down to service_role only.
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON FUNCTION public.charge_stream_minutes(uuid, int, numeric, int, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_stream_minutes(uuid, int, numeric, int, jsonb)
    TO service_role;

-- ---------------------------------------------------------------------
-- Realtime for live pocket balance + streaming meter in the UI.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE pockets;
        ALTER PUBLICATION supabase_realtime ADD TABLE pocket_ledger;
        ALTER PUBLICATION supabase_realtime ADD TABLE stream_sessions;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE pockets IS 'Internal per-wallet USDC balance for pay-per-listen streaming (Mode 1).';
COMMENT ON TABLE stream_sessions IS 'A listener''s metered streaming session for a work.';
COMMENT ON TABLE pocket_ledger IS 'Append-only ledger of pocket movements (topup/stream/withdrawal).';
