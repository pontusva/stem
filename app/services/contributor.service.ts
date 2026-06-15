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
import {
  Contributor,
  ContributorInput,
  ContributorWithWallet,
} from "@/types/royalty";
import { splitsAreValid } from "@/lib/utils/royalty";

const CONTRIBUTOR_SELECT = `
  *,
  wallet:wallets!contributors_wallet_id_fkey ( id, wallet_address, circle_wallet_id )
`;

export const createContributorService = (supabase: SupabaseClient) => ({
  /** Insert contributor rows for a work. Splits must sum to 100%. */
  async addContributors(
    workId: string,
    contributors: ContributorInput[]
  ): Promise<Contributor[]> {
    const { valid, total } = splitsAreValid(contributors);
    if (!valid) {
      throw new Error(
        `Contributor splits must sum to 100% (got ${total.toFixed(2)}%)`
      );
    }

    const rows = contributors.map((c) => ({
      work_id: workId,
      profile_id: c.profile_id ?? null,
      wallet_id: c.wallet_id,
      contributor_type: c.contributor_type,
      display_name: c.display_name,
      split_pct: c.split_pct,
      erc8004_agent_id: c.erc8004_agent_id ?? null,
      erc8004_tx_hash: c.erc8004_tx_hash ?? null,
    }));

    const { data, error } = await supabase
      .from("contributors")
      .insert(rows)
      .select();

    if (error) throw new Error(`Failed to add contributors: ${error.message}`);
    return (data ?? []) as Contributor[];
  },

  async getContributorsForWork(
    workId: string
  ): Promise<ContributorWithWallet[]> {
    const { data, error } = await supabase
      .from("contributors")
      .select(CONTRIBUTOR_SELECT)
      .eq("work_id", workId)
      .order("split_pct", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch contributors: ${error.message}`);
    }
    return (data ?? []) as unknown as ContributorWithWallet[];
  },

  /** Resolve a registered user's wallet by email (for human contributors). */
  async resolveHumanWalletByEmail(
    email: string
  ): Promise<{ profileId: string; walletId: string } | null> {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    if (!profile) return null;

    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("profile_id", profile.id)
      .single();
    if (!wallet) return null;

    return { profileId: profile.id, walletId: wallet.id };
  },
});
