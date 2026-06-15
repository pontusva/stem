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

export interface EarningItem {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  recipientName: string;
  recipientType: "human" | "ai";
  walletId: string;
  workId: string | null;
  workTitle: string;
  fromRemix: boolean; // the source work is a derivative → upstream/provenance income
}

export interface EarningsSummary {
  total: number; // settled (COMPLETE)
  pending: number;
  fromRemixTotal: number; // settled income arriving via downstream remixes
  items: EarningItem[];
  pocketBalance: number; // withdrawable streaming income sitting in the pocket
  streamingEarned: number; // lifetime pay-per-listen credits
}

/**
 * Earnings = every royalty payout to the user's own wallet AND to any AI agent
 * they created. Flags payouts that arrived from a downstream remix (the source
 * work is itself a derivative), i.e. provenance income.
 */
export const createEarningsService = (supabase: SupabaseClient) => ({
  async getEarnings(profileId: string): Promise<EarningsSummary> {
    // The user's payout wallets: their own + their AI agents.
    const { data: ownWallets } = await supabase
      .from("wallets")
      .select("id")
      .eq("profile_id", profileId);
    const { data: aiWallets } = await supabase
      .from("wallets")
      .select("id")
      .eq("created_by_profile_id", profileId)
      .eq("is_ai", true);

    const walletIds = [
      ...(ownWallets ?? []).map((w: any) => w.id),
      ...(aiWallets ?? []).map((w: any) => w.id),
    ];
    if (walletIds.length === 0) {
      return {
        total: 0,
        pending: 0,
        fromRemixTotal: 0,
        items: [],
        pocketBalance: 0,
        streamingEarned: 0,
      };
    }

    // Streaming (pay-per-listen) income lives in the pocket ledger, separate
    // from the royalty_payments escrow flow.
    const { data: pocketRows } = await supabase
      .from("pockets")
      .select("balance_usdc")
      .in("wallet_id", walletIds);
    const pocketBalance = (pocketRows ?? []).reduce(
      (a: number, p: any) => a + Number(p.balance_usdc),
      0
    );
    const { data: creditRows } = await supabase
      .from("pocket_ledger")
      .select("amount_usdc")
      .in("wallet_id", walletIds)
      .eq("entry_type", "STREAM_CREDIT");
    const streamingEarned = (creditRows ?? []).reduce(
      (a: number, r: any) => a + Number(r.amount_usdc),
      0
    );

    const { data, error } = await supabase
      .from("royalty_payments")
      .select(
        `id, amount_usdc, status, created_at, wallet_id,
         contributor:contributors!royalty_payments_contributor_id_fkey ( display_name, contributor_type ),
         license:licenses!royalty_payments_license_id_fkey (
           work:works!licenses_work_id_fkey ( id, title, parent_work_id )
         )`
      )
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load earnings: ${error.message}`);

    const items: EarningItem[] = (data ?? []).map((p: any) => {
      const work = p.license?.work ?? null;
      return {
        id: p.id,
        amount: Number(p.amount_usdc),
        status: p.status,
        createdAt: p.created_at,
        recipientName: p.contributor?.display_name ?? "You",
        recipientType: p.contributor?.contributor_type ?? "human",
        walletId: p.wallet_id,
        workId: work?.id ?? null,
        workTitle: work?.title ?? "a work",
        fromRemix: !!work?.parent_work_id,
      };
    });

    const total = items
      .filter((i) => i.status === "COMPLETE")
      .reduce((a, i) => a + i.amount, 0);
    const pending = items
      .filter((i) => i.status === "PENDING")
      .reduce((a, i) => a + i.amount, 0);
    const fromRemixTotal = items
      .filter((i) => i.status === "COMPLETE" && i.fromRemix)
      .reduce((a, i) => a + i.amount, 0);

    return { total, pending, fromRemixTotal, items, pocketBalance, streamingEarned };
  },
});
