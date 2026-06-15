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
-- Royalty Protocol schema
-- Creative works with a provenance chain. When a work is licensed via an
-- ERC-8183 escrow job, the released USDC is split across every contributor
-- (human OR AI) per a manually-defined percentage. AI contributors get their
-- own Circle wallet (wallets.profile_id = NULL) and an ERC-8004 onchain identity.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- AI contributor wallets have no human profile.
ALTER TABLE wallets ALTER COLUMN profile_id DROP NOT NULL;

-- ---------------------------------------------------------------------
-- works: a registered creative file, optionally derived from a parent work
-- ---------------------------------------------------------------------
CREATE TABLE works (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    description      TEXT,
    work_type        TEXT NOT NULL,            -- 'music' | 'art' | 'writing'
    file_path        TEXT,                     -- storage path in the works-files bucket
    file_url         TEXT,                     -- public URL for catalog display
    parent_work_id   UUID REFERENCES works(id) ON DELETE SET NULL,
    license_price    NUMERIC(20, 6) NOT NULL DEFAULT 0,  -- default USDC price to license
    status           TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_works_owner_profile_id ON works(owner_profile_id);
CREATE INDEX idx_works_parent_work_id ON works(parent_work_id);

-- ---------------------------------------------------------------------
-- contributors: who gets paid for a work, and how much. profile_id is NULL
-- for AI contributors. erc8004_agent_id is the IdentityRegistry token id.
-- ---------------------------------------------------------------------
CREATE TABLE contributors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id           UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    profile_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,   -- NULL for AI
    wallet_id         UUID NOT NULL REFERENCES wallets(id),
    contributor_type  TEXT NOT NULL,           -- 'human' | 'ai'
    display_name      TEXT NOT NULL,
    split_pct         NUMERIC(5, 2) NOT NULL CHECK (split_pct > 0 AND split_pct <= 100),
    erc8004_agent_id  TEXT,                     -- ERC-721 token id from IdentityRegistry
    erc8004_tx_hash   TEXT,                     -- registration tx hash (arcscan link)
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contributors_work_id ON contributors(work_id);
CREATE INDEX idx_contributors_wallet_id ON contributors(wallet_id);

-- ---------------------------------------------------------------------
-- licenses: one ERC-8183 escrow job per license of a work. The agent wallet
-- is provider+evaluator on chain; it receives the full amount then fans it out.
-- ---------------------------------------------------------------------
CREATE TABLE licenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id           UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    buyer_profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    buyer_wallet_id   UUID NOT NULL REFERENCES wallets(id),
    amount_usdc       NUMERIC(20, 6) NOT NULL,
    onchain_job_id    TEXT,                     -- ERC-8183 job id (uint256 as string)
    job_tx_hash       TEXT,                     -- createJob tx hash
    status            TEXT NOT NULL DEFAULT 'INITIATED',
    -- INITIATED -> JOB_CREATED -> BUDGETED -> APPROVED -> FUNDED
    --   -> SUBMITTED -> COMPLETED -> SPLITTING -> CLOSED | REFUNDED | FAILED
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_licenses_work_id ON licenses(work_id);
CREATE INDEX idx_licenses_buyer_profile_id ON licenses(buyer_profile_id);

-- ---------------------------------------------------------------------
-- royalty_payments: one row per contributor per license release.
-- circle_transfer_id is the Circle wallet-to-wallet transfer transaction id;
-- the webhook flips status to COMPLETE when that transfer settles.
-- ---------------------------------------------------------------------
CREATE TABLE royalty_payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id         UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    contributor_id     UUID NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
    wallet_id          UUID NOT NULL REFERENCES wallets(id),
    amount_usdc        NUMERIC(20, 6) NOT NULL,
    split_pct          NUMERIC(5, 2) NOT NULL,
    circle_transfer_id TEXT,
    status             TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | COMPLETE | FAILED
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_royalty_payments_license_id ON royalty_payments(license_id);
CREATE INDEX idx_royalty_payments_transfer_id ON royalty_payments(circle_transfer_id);

-- ---------------------------------------------------------------------
-- updated_at triggers (reuse the helper defined in the initial schema)
-- ---------------------------------------------------------------------
CREATE TRIGGER update_works_updated_at
    BEFORE UPDATE ON works
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_licenses_updated_at
    BEFORE UPDATE ON licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- Enable RLS. Policies are defined in the dedicated RLS migration that
-- runs last (20260614120000_enable_rls_policies.sql).
-- ---------------------------------------------------------------------
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_payments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Grants (mirror initial schema)
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------
-- Storage bucket for work files. Public read so the catalog can render
-- previews; uploads happen server-side with the service/anon client.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'works-files',
    'works-files',
    true,
    false,
    20971520,
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/pdf', 'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    public = EXCLUDED.public;

-- ---------------------------------------------------------------------
-- Realtime for live license + royalty status in the UI
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE licenses;
        ALTER PUBLICATION supabase_realtime ADD TABLE royalty_payments;
        ALTER PUBLICATION supabase_realtime ADD TABLE works;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE works IS 'Registered creative works with provenance chain (parent_work_id).';
COMMENT ON TABLE contributors IS 'Human or AI contributors to a work with royalty split percentages.';
COMMENT ON TABLE licenses IS 'ERC-8183 escrow jobs licensing a work; agent wallet is provider+evaluator.';
COMMENT ON TABLE royalty_payments IS 'Per-contributor USDC payouts fanned out on license completion.';
