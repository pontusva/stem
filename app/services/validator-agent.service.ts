/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { provisionAgentWallet } from "@/app/services/ai-agent.service";

/** The platform validator agent's stable display name (its dedupe key). */
export const VALIDATOR_AGENT_NAME = "STEM Validator";

export interface ValidatorAgent {
  id: string; // wallet id
  display_name: string;
  wallet_address: string;
  circle_wallet_id: string;
  erc8004_agent_id: string | null;
}

const VALIDATOR_SELECT =
  "id, display_name, wallet_address, circle_wallet_id, erc8004_agent_id";

// In-process cache so we don't re-query on every purchase within a warm lambda.
let cached: ValidatorAgent | null = null;

/**
 * Return the single platform "STEM Validator" agent, minting it on first use.
 * Unlike user agents it has no human owner (created_by_profile_id IS NULL), so
 * it never appears on any user's roster — it's a system actor that earns
 * service fees for the validation work it performs.
 */
export const createValidatorAgentService = (supabase: SupabaseClient) => ({
  async getOrCreateValidatorAgent(): Promise<ValidatorAgent> {
    if (cached) return cached;

    // Look up the existing platform validator (owner-less, is_ai).
    const { data: existing } = await supabase
      .from("wallets")
      .select(VALIDATOR_SELECT)
      .eq("is_ai", true)
      .is("created_by_profile_id", null)
      .ilike("display_name", VALIDATOR_AGENT_NAME)
      .limit(1)
      .maybeSingle();

    if (existing) {
      cached = existing as ValidatorAgent;
      return cached;
    }

    // Mint its Circle wallet + best-effort ERC-8004 identity.
    const { created, walletSetId, agentId, identityTxHash } =
      await provisionAgentWallet(supabase, {
        name: VALIDATOR_AGENT_NAME,
        origin: "Anthropic Claude",
        capabilities: "validation, quality-review",
      });

    const { data: walletRow, error } = await supabase
      .from("wallets")
      .insert({
        profile_id: null,
        is_ai: true,
        display_name: VALIDATOR_AGENT_NAME,
        origin: "Anthropic Claude",
        capabilities: "validation, quality-review",
        created_by_profile_id: null, // platform-owned system agent
        circle_wallet_id: created.id,
        wallet_type: created.custodyType,
        wallet_set_id: walletSetId,
        wallet_address: created.address,
        account_type: created.accountType,
        blockchain: created.blockchain,
        currency: "USDC",
        erc8004_agent_id: agentId,
        erc8004_tx_hash: identityTxHash,
      })
      .select(VALIDATOR_SELECT)
      .single();

    if (error || !walletRow) {
      throw new Error(
        `Failed to provision STEM Validator agent: ${error?.message ?? "unknown"}`
      );
    }

    cached = walletRow as ValidatorAgent;
    return cached;
  },
});
