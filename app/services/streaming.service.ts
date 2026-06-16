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
import { computeSplitAmounts } from "@/lib/utils/royalty";
import {
  STREAM_RATE_USDC_PER_MINUTE,
  costForMinutes,
  minutesFromSeconds,
} from "@/lib/utils/streaming";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { ARC, waitForCircleTx } from "@/lib/utils/arc";

/**
 * Anti-tamper cap: a single heartbeat can never bill more than this many
 * minutes, no matter what seconds the client reports. Heartbeats fire ~once a
 * minute, so a generous cap still blocks a client claiming hours at once.
 */
const MAX_MINUTES_PER_CHARGE = 20;

export interface StreamChargeResult {
  sessionId: string;
  secondsPlayed: number;
  minutesCharged: number;
  amountCharged: number; // cumulative USDC charged this session
  pocketBalance: number;
  rate: number;
  paused?: boolean;
  reason?: string;
  status?: string;
}

interface StreamSession {
  id: string;
  work_id: string;
  listener_profile_id: string;
  listener_wallet_id: string;
  seconds_played: number;
  minutes_charged: number;
  amount_charged_usdc: number | string;
  status: string;
}

export const createStreamingService = (supabase: SupabaseClient) => ({
  /** Ensure a pocket row exists for a wallet; returns it. */
  async getOrCreatePocket(walletId: string, profileId: string | null) {
    const { data: existing } = await supabase
      .from("pockets")
      .select("*")
      .eq("wallet_id", walletId)
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await supabase
      .from("pockets")
      .insert({ wallet_id: walletId, profile_id: profileId })
      .select()
      .single();
    if (error) {
      // Lost a create race — read the row the other writer made.
      const { data: again } = await supabase
        .from("pockets")
        .select("*")
        .eq("wallet_id", walletId)
        .single();
      if (again) return again;
      throw new Error(`Failed to create pocket: ${error.message}`);
    }
    return data;
  },

  async getPocketBalance(walletId: string): Promise<number> {
    const { data } = await supabase
      .from("pockets")
      .select("balance_usdc")
      .eq("wallet_id", walletId)
      .maybeSingle();
    return data ? Number(data.balance_usdc) : 0;
  },

  async getLedger(walletId: string, limit = 50) {
    const { data } = await supabase
      .from("pocket_ledger")
      .select("*")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },

  /**
   * The caller's pocket wallet ids: their own wallet(s) plus any AI-agent
   * wallets they created. Used so balance, ledger, and withdraw all cover the
   * same set (matching the earnings display).
   */
  async getOwnedWalletIds(profileId: string): Promise<string[]> {
    const { data: own } = await supabase
      .from("wallets")
      .select("id")
      .eq("profile_id", profileId);
    const { data: ai } = await supabase
      .from("wallets")
      .select("id")
      .eq("created_by_profile_id", profileId)
      .eq("is_ai", true);
    return [
      ...(own ?? []).map((w: any) => w.id),
      ...(ai ?? []).map((w: any) => w.id),
    ];
  },

  async getPocketBalanceForWallets(walletIds: string[]): Promise<number> {
    if (!walletIds.length) return 0;
    const { data } = await supabase
      .from("pockets")
      .select("balance_usdc")
      .in("wallet_id", walletIds);
    return (data ?? []).reduce((a: number, p: any) => a + Number(p.balance_usdc), 0);
  },

  async getLedgerForWallets(walletIds: string[], limit = 50) {
    if (!walletIds.length) return [];
    const { data } = await supabase
      .from("pocket_ledger")
      .select("*")
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },

  /** Reuse the listener's ACTIVE session for a work, or open a new one. */
  async startSession(
    workId: string,
    listenerProfileId: string,
    listenerWalletId: string
  ): Promise<StreamSession> {
    const { data: existing } = await supabase
      .from("stream_sessions")
      .select("*")
      .eq("work_id", workId)
      .eq("listener_profile_id", listenerProfileId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing as StreamSession;

    const { data, error } = await supabase
      .from("stream_sessions")
      .insert({
        work_id: workId,
        listener_profile_id: listenerProfileId,
        listener_wallet_id: listenerWalletId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to start stream session: ${error.message}`);
    return data as StreamSession;
  },

  async getSession(sessionId: string): Promise<StreamSession | null> {
    const { data } = await supabase
      .from("stream_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    return (data as StreamSession) ?? null;
  },

  /**
   * Charge for any newly-completed minutes since the session was last billed.
   * Splits the cost across the work's contributors and applies the whole
   * movement atomically via the charge_stream_minutes RPC. Returns a `paused`
   * result (without charging) when the listener's pocket can't cover it.
   */
  async chargeForSeconds(
    session: StreamSession,
    secondsPlayed: number
  ): Promise<StreamChargeResult> {
    const safeSeconds = Math.max(
      session.seconds_played,
      Math.floor(Number(secondsPlayed) || 0)
    );
    const newMinutes = minutesFromSeconds(safeSeconds);
    const alreadyCharged = session.minutes_charged;

    const unbilled = () => ({
      sessionId: session.id,
      secondsPlayed: safeSeconds,
      minutesCharged: alreadyCharged,
      amountCharged: Number(session.amount_charged_usdc),
      rate: STREAM_RATE_USDC_PER_MINUTE,
    });

    let deltaMinutes = newMinutes - alreadyCharged;
    if (deltaMinutes <= 0) {
      // No whole new minute yet — just persist seconds progress.
      if (safeSeconds > session.seconds_played) {
        await supabase
          .from("stream_sessions")
          .update({ seconds_played: safeSeconds })
          .eq("id", session.id);
      }
      const pocketBalance = await this.getPocketBalance(session.listener_wallet_id);
      return { ...unbilled(), pocketBalance };
    }

    if (deltaMinutes > MAX_MINUTES_PER_CHARGE) deltaMinutes = MAX_MINUTES_PER_CHARGE;
    const chargeToMinutes = alreadyCharged + deltaMinutes;
    const cost = costForMinutes(deltaMinutes);

    // Who gets paid for this work.
    const { data: contributors } = await supabase
      .from("contributors")
      .select("id, wallet_id, profile_id, split_pct")
      .eq("work_id", session.work_id)
      .order("split_pct", { ascending: false });

    if (!contributors?.length) {
      const pocketBalance = await this.getPocketBalance(session.listener_wallet_id);
      return { ...unbilled(), pocketBalance };
    }

    const amounts = computeSplitAmounts(cost, contributors as any[]);
    const credits = contributors
      .map((c: any, i: number) => ({
        wallet_id: c.wallet_id,
        profile_id: c.profile_id ?? null,
        amount: amounts[i] ?? 0,
      }))
      .filter((c) => c.amount > 0);

    const { data: newBalance, error } = await supabase.rpc("charge_stream_minutes", {
      p_session_id: session.id,
      p_minutes: chargeToMinutes,
      p_cost: cost,
      p_seconds: safeSeconds,
      p_credits: credits,
    });

    if (error) {
      if ((error.message || "").includes("INSUFFICIENT_POCKET")) {
        const pocketBalance = await this.getPocketBalance(session.listener_wallet_id);
        return {
          ...unbilled(),
          pocketBalance,
          paused: true,
          reason: "INSUFFICIENT_POCKET",
        };
      }
      throw new Error(`Streaming charge failed: ${error.message}`);
    }

    return {
      sessionId: session.id,
      secondsPlayed: safeSeconds,
      minutesCharged: chargeToMinutes,
      amountCharged: Number(session.amount_charged_usdc) + cost,
      pocketBalance: Number(newBalance),
      rate: STREAM_RATE_USDC_PER_MINUTE,
    };
  },

  async endSession(
    session: StreamSession,
    secondsPlayed: number
  ): Promise<StreamChargeResult> {
    const result = await this.chargeForSeconds(session, secondsPlayed);
    await supabase
      .from("stream_sessions")
      .update({ status: "ENDED" })
      .eq("id", session.id);
    return { ...result, status: "ENDED" };
  },

  /**
   * Credit a pocket after an on-chain top-up (user wallet -> agent wallet) has
   * confirmed. Optimistic-concurrency update so a concurrent stream debit can't
   * be silently lost; one retry covers the rare race.
   */
  async creditTopup(
    walletId: string,
    profileId: string | null,
    amount: number,
    circleTransferId: string
  ): Promise<number> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const pocket = await this.getOrCreatePocket(walletId, profileId);
      const current = Number(pocket.balance_usdc);
      const next = Math.round((current + amount) * 1_000_000) / 1_000_000;
      const { data, error } = await supabase
        .from("pockets")
        .update({ balance_usdc: next })
        .eq("wallet_id", walletId)
        .eq("balance_usdc", pocket.balance_usdc)
        .select();
      if (error) throw new Error(`Failed to credit pocket: ${error.message}`);
      if (data && data.length > 0) {
        await supabase.from("pocket_ledger").insert({
          wallet_id: walletId,
          profile_id: profileId,
          entry_type: "TOPUP",
          amount_usdc: amount,
          circle_transfer_id: circleTransferId,
          status: "COMPLETE",
        });
        return next;
      }
      // Balance moved under us — retry.
    }
    throw new Error("Could not credit pocket after retries");
  },

  /**
   * Withdraw the caller's full streaming pocket balance on-chain. Pockets accrue
   * per wallet, and a creator's displayed balance spans their own wallet AND any
   * AI-agent wallets they own (see earnings.service), so withdraw aggregates the
   * same set of wallet ids — otherwise income sitting in an AI agent's pocket
   * would show as a balance yet report "Nothing to withdraw". Drains every
   * funded pocket, sends the total to `destinationAddress`, and settles the
   * ledger (refunding on failure).
   */
  async withdraw(
    walletIds: string[],
    destinationAddress: string
  ): Promise<{ amount: number; transferId?: string }> {
    const agentWalletId = process.env.NEXT_PUBLIC_AGENT_WALLET_ID;
    if (!agentWalletId) throw new Error("NEXT_PUBLIC_AGENT_WALLET_ID is not configured");
    if (!walletIds.length) throw new Error("Nothing to withdraw");

    // Every pocket of the caller's that actually holds a balance.
    const { data: pockets } = await supabase
      .from("pockets")
      .select("wallet_id, profile_id, balance_usdc")
      .in("wallet_id", walletIds)
      .gt("balance_usdc", 0);
    const funded = (pockets ?? []).filter((p: any) => Number(p.balance_usdc) > 0);
    if (!funded.length) throw new Error("Nothing to withdraw");

    // Optimistically drain each pocket (skip any that changed under us).
    const drained: { wallet_id: string; profile_id: string | null; amount: number }[] = [];
    for (const p of funded) {
      const { data } = await supabase
        .from("pockets")
        .update({ balance_usdc: 0 })
        .eq("wallet_id", p.wallet_id)
        .eq("balance_usdc", p.balance_usdc)
        .select();
      if (data && data.length > 0) {
        drained.push({
          wallet_id: p.wallet_id,
          profile_id: p.profile_id,
          amount: Number(p.balance_usdc),
        });
      }
    }
    const total =
      Math.round(drained.reduce((a, d) => a + d.amount, 0) * 1_000_000) / 1_000_000;
    if (total <= 0) {
      throw new Error("Pocket balance changed — please retry the withdrawal");
    }

    // One PENDING ledger row per drained pocket.
    const { data: ledgerRows } = await supabase
      .from("pocket_ledger")
      .insert(
        drained.map((d) => ({
          wallet_id: d.wallet_id,
          profile_id: d.profile_id,
          entry_type: "WITHDRAWAL",
          amount_usdc: -d.amount,
          status: "PENDING",
        }))
      )
      .select();
    const ledgerIds = (ledgerRows ?? []).map((r: any) => r.id);

    try {
      const transfer = await circleDeveloperSdk.createTransaction({
        walletId: agentWalletId,
        destinationAddress,
        amount: [total.toFixed(6)],
        tokenAddress: ARC.USDC,
        blockchain: ARC.BLOCKCHAIN as any,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      const transferId = transfer.data?.id;
      if (transferId && ledgerIds.length) {
        await supabase
          .from("pocket_ledger")
          .update({ circle_transfer_id: transferId })
          .in("id", ledgerIds);
      }
      if (!transferId) throw new Error("withdrawal did not return a transaction id");

      await waitForCircleTx(transferId, "pocket withdrawal");
      if (ledgerIds.length) {
        await supabase
          .from("pocket_ledger")
          .update({ status: "COMPLETE" })
          .in("id", ledgerIds);
      }
      return { amount: total, transferId };
    } catch (err) {
      // Refund each drained pocket (add back, in case credits arrived meanwhile)
      // and mark the ledger rows FAILED.
      for (const d of drained) {
        const fresh = await this.getPocketBalance(d.wallet_id);
        await supabase
          .from("pockets")
          .update({ balance_usdc: Math.round((fresh + d.amount) * 1_000_000) / 1_000_000 })
          .eq("wallet_id", d.wallet_id);
      }
      if (ledgerIds.length) {
        await supabase
          .from("pocket_ledger")
          .update({ status: "FAILED" })
          .in("id", ledgerIds);
      }
      throw err;
    }
  },
});
