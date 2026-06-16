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
  total: number; // settled (COMPLETE) royalties to the user's OWN wallet
  pending: number; // pending royalties to the user's OWN wallet
  fromRemixTotal: number; // settled own-wallet income arriving via downstream remixes
  aiEarned: number; // settled royalties to AI agents the user created (tracked separately)
  items: EarningItem[]; // royalty payments to the user's OWN wallet only
  pocketBalance: number; // withdrawable streaming income (own + AI agents — matches withdraw)
  streamingEarned: number; // lifetime pay-per-listen credits (own + AI agents)
}

/**
 * "Your earnings" is the logged-in human's own wallet. Royalty totals and the
 * feed count ONLY payouts to the user's own wallet (profile_id) — royalties paid
 * to AI agents the user created are surfaced separately as `aiEarned` (and on the
 * AI agents dashboard), not folded into the human's headline total.
 *
 * Streaming pocket figures still span own + AI agents, because the pocket
 * withdrawal flow sweeps both together; keeping them combined makes the displayed
 * balance match what the withdraw button actually moves. Flags payouts that
 * arrived from a downstream remix (the source work is a derivative).
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

    const ownWalletIds = (ownWallets ?? []).map((w: any) => w.id);
    const aiWalletIds = (aiWallets ?? []).map((w: any) => w.id);
    const allWalletIds = [...ownWalletIds, ...aiWalletIds];

    if (allWalletIds.length === 0) {
      return {
        total: 0,
        pending: 0,
        fromRemixTotal: 0,
        aiEarned: 0,
        items: [],
        pocketBalance: 0,
        streamingEarned: 0,
      };
    }

    // Streaming (pay-per-listen) income lives in the pocket ledger, separate from
    // the royalty_payments flow. Scoped to the human's OWN wallet — an AI agent's
    // streaming income stays in its own pocket and is withdrawn to its own wallet
    // (per-agent withdraw on the AI dashboard), so this matches the human's
    // own-only withdraw and shows on the agent card, not here.
    const { data: pocketRows } = await supabase
      .from("pockets")
      .select("balance_usdc")
      .in("wallet_id", ownWalletIds);
    const pocketBalance = (pocketRows ?? []).reduce(
      (a: number, p: any) => a + Number(p.balance_usdc),
      0
    );
    const { data: creditRows } = await supabase
      .from("pocket_ledger")
      .select("amount_usdc")
      .in("wallet_id", ownWalletIds)
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
      .in("wallet_id", allWalletIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load earnings: ${error.message}`);

    const ownSet = new Set(ownWalletIds);
    const allRows: EarningItem[] = (data ?? []).map((p: any) => {
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

    // The human's own-wallet payouts drive the headline total and feed; an AI
    // agent the user created earns into its OWN wallet and is tallied separately.
    const items = allRows.filter((i) => ownSet.has(i.walletId));

    const total = items
      .filter((i) => i.status === "COMPLETE")
      .reduce((a, i) => a + i.amount, 0);
    const pending = items
      .filter((i) => i.status === "PENDING")
      .reduce((a, i) => a + i.amount, 0);
    const fromRemixTotal = items
      .filter((i) => i.status === "COMPLETE" && i.fromRemix)
      .reduce((a, i) => a + i.amount, 0);
    const aiEarned = allRows
      .filter((i) => !ownSet.has(i.walletId) && i.status === "COMPLETE")
      .reduce((a, i) => a + i.amount, 0);

    return {
      total,
      pending,
      fromRemixTotal,
      aiEarned,
      items,
      pocketBalance,
      streamingEarned,
    };
  },
});
