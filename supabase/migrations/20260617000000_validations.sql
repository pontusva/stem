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
-- Paid AI Validation Gate
--
-- Before a license is granted, a platform "STEM Validator" AI agent reviews
-- the delivered work with Claude. The verdict GATES the payout (a FAIL aborts
-- the sale before any money moves) and on PASS the validator agent is paid a
-- USDC validation fee carved from the license amount — paying an AI for the
-- *work it performs*, alongside the royalty splits that pay AI co-creators.
--
-- One row per validation attempt. fee_usdc / circle_transfer_id are set only
-- when a PASS leads to a paid fee leg (fail-open PASSes record fee_usdc = 0).
-- =====================================================================

CREATE TABLE validations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id          UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    work_id             UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    validator_wallet_id UUID NOT NULL REFERENCES wallets(id),  -- the STEM Validator agent
    model               TEXT NOT NULL,                         -- e.g. claude-opus-4-8
    verdict             TEXT NOT NULL,                         -- PASS | FAIL
    confidence          NUMERIC(4, 3),                         -- 0.000 .. 1.000
    reasoning           TEXT,
    evidence_kind       TEXT,                                  -- text | image | metadata
    fee_usdc            NUMERIC(20, 6) NOT NULL DEFAULT 0,
    circle_transfer_id  TEXT,                                  -- fee transfer (NULL on FAIL / fail-open)
    status              TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING | COMPLETE | FAILED
    onchain_tx_hash     TEXT,                                  -- reserved: future ERC-8004 Validation registry write
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_validations_license_id ON validations(license_id);
CREATE INDEX idx_validations_work_id ON validations(work_id);
CREATE INDEX idx_validations_validator_wallet ON validations(validator_wallet_id);

-- ---------------------------------------------------------------------
-- RLS — visible to the license buyer, the work owner, or the owner of the
-- validator wallet (mirrors royalty_payments_select). All writes happen
-- server-side via the service_role client, which bypasses RLS.
-- ---------------------------------------------------------------------
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validations_select" ON validations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM licenses l
            JOIN works wk ON wk.id = l.work_id
            WHERE l.id = validations.license_id
              AND (l.buyer_profile_id = public.current_profile_id()
                   OR wk.owner_profile_id = public.current_profile_id())
        )
        OR validator_wallet_id IN (
            SELECT w.id FROM wallets w
            WHERE w.created_by_profile_id = public.current_profile_id()
        )
    );

-- ---------------------------------------------------------------------
-- Grants (mirror the royalty schema)
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------
-- Realtime so the purchase dialog can react to validation status live.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE validations;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE validations IS 'Paid AI work-validation gate: one row per license validation; fee_usdc paid to the STEM Validator agent on PASS.';
