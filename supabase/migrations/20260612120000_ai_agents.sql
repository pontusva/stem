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
-- Reusable AI agents.
-- An AI agent is a wallet row with is_ai = true: a named, owned, onchain
-- identity (ERC-8004) that can be reused as a contributor across many works,
-- instead of minting a fresh wallet every time one is added.
-- =====================================================================

ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS origin TEXT,                 -- "where it's from" e.g. "Anthropic Claude"
    ADD COLUMN IF NOT EXISTS capabilities TEXT,           -- comma list e.g. "music, lyrics"
    ADD COLUMN IF NOT EXISTS created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS erc8004_agent_id TEXT,
    ADD COLUMN IF NOT EXISTS erc8004_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_wallets_ai_owner
    ON wallets(created_by_profile_id) WHERE is_ai;

-- Salvage the existing orphan AI wallets (profile_id IS NULL, created before this
-- model existed) into named, owned agents using the contributor rows that point
-- at them. Owner = the owner of the work they were first added to.
UPDATE wallets w SET
    is_ai = true,
    display_name = COALESCE(w.display_name, c.display_name),
    erc8004_agent_id = COALESCE(w.erc8004_agent_id, c.erc8004_agent_id),
    erc8004_tx_hash = COALESCE(w.erc8004_tx_hash, c.erc8004_tx_hash),
    created_by_profile_id = COALESCE(w.created_by_profile_id, wk.owner_profile_id)
FROM contributors c
JOIN works wk ON wk.id = c.work_id
WHERE c.wallet_id = w.id
  AND c.contributor_type = 'ai';

-- Any remaining profile-less wallets that are clearly AI but unreferenced.
UPDATE wallets SET is_ai = true
WHERE profile_id IS NULL AND is_ai IS DISTINCT FROM true;

COMMENT ON COLUMN wallets.is_ai IS 'true when this wallet is a reusable AI agent (no human profile).';
COMMENT ON COLUMN wallets.created_by_profile_id IS 'Human profile that created/owns this AI agent.';
