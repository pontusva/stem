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
import type { Blockchain } from "@circle-fin/smart-contract-platform";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import {
  ARC,
  waitForCircleTx,
  getAgentIdFromTxHash,
} from "@/lib/utils/arc";
import { AiAgent, AiAgentWithStats } from "@/types/royalty";

const AGENT_SELECT =
  "id, display_name, origin, capabilities, wallet_address, circle_wallet_id, erc8004_agent_id, erc8004_tx_hash, created_at";

export interface ProvisionedAgentWallet {
  /** The raw Circle wallet object (id, address, accountType, custodyType, blockchain). */
  created: any;
  walletSetId: string;
  /** ERC-8004 token id, or null if identity registration was skipped/failed. */
  agentId: string | null;
  identityTxHash: string | null;
  identityError: string | null;
}

/**
 * Mint a Circle SCA wallet for an AI agent and best-effort register an ERC-8004
 * on-chain identity for it. Shared by both human-owned agents (createOrGetAgent)
 * and the platform STEM Validator agent. The caller persists the wallet row,
 * since ownership (profile_id / created_by_profile_id) differs per use.
 */
export async function provisionAgentWallet(
  supabase: SupabaseClient,
  params: { name: string; origin?: string | null; capabilities?: string | null }
): Promise<ProvisionedAgentWallet> {
  const name = params.name.trim();

  if (!process.env.CIRCLE_BLOCKCHAIN) {
    throw new Error("CIRCLE_BLOCKCHAIN is not configured");
  }

  // Mint a Circle SCA wallet for the agent.
  const walletSet = await circleDeveloperSdk.createWalletSet({
    name: `AI: ${name}`,
  });
  const walletSetId = walletSet.data?.walletSet?.id;
  if (!walletSetId) throw new Error("Failed to create wallet set");

  const wallets = await circleDeveloperSdk.createWallets({
    accountType: "SCA",
    blockchains: [process.env.CIRCLE_BLOCKCHAIN as Blockchain],
    count: 1,
    walletSetId,
  });
  const created: any = wallets.data?.wallets?.[0];
  if (!created) throw new Error("Failed to create AI wallet");

  // Best-effort ERC-8004 identity registration on Arc.
  let agentId: string | null = null;
  let identityTxHash: string | null = null;
  let identityError: string | null = null;

  const agentWalletId = process.env.NEXT_PUBLIC_AGENT_WALLET_ID;
  const agentWalletAddress = process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS;

  if (agentWalletId && agentWalletAddress) {
    try {
      const metadata = {
        name,
        type: "ai",
        origin: params.origin ?? null,
        capabilities: params.capabilities
          ? params.capabilities.split(",").map((c) => c.trim()).filter(Boolean)
          : [],
        wallet_address: created.address,
        registered_by: agentWalletAddress,
      };
      const metaPath = `ai-identities/${created.id}.json`;
      await supabase.storage
        .from("works-files")
        .upload(metaPath, JSON.stringify(metadata, null, 2), {
          contentType: "application/json",
          upsert: true,
        });
      const { data: pub } = supabase.storage
        .from("works-files")
        .getPublicUrl(metaPath);

      const register = await circleDeveloperSdk.createContractExecutionTransaction({
        walletId: agentWalletId,
        contractAddress: ARC.IDENTITY_REGISTRY,
        abiFunctionSignature: "register(string)",
        abiParameters: [pub.publicUrl],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });

      const txId = register.data?.id;
      if (txId) {
        const { txHash } = await waitForCircleTx(txId, "ERC-8004 register");
        identityTxHash = txHash ?? null;
        if (txHash) {
          agentId = await getAgentIdFromTxHash(txHash, agentWalletAddress);
        }
      }
    } catch (err: any) {
      identityError = err?.message ?? "ERC-8004 registration failed";
      console.error("ERC-8004 registration failed:", identityError);
    }
  } else {
    identityError = "Agent wallet not configured; skipped ERC-8004 registration";
  }

  return { created, walletSetId, agentId, identityTxHash, identityError };
}

/** Operates with the service-role client (privileged writes + storage). */
export const createAiAgentService = (supabase: SupabaseClient) => ({
  /**
   * Return the caller's existing AI agent with this name, or mint a brand-new
   * one (Circle wallet + ERC-8004 identity). Dedupe prevents minting a second
   * wallet for the same name.
   */
  async createOrGetAgent(params: {
    ownerProfileId: string;
    displayName: string;
    origin?: string | null;
    capabilities?: string | null;
  }): Promise<{ agent: AiAgent; reused: boolean; identityError: string | null }> {
    const name = params.displayName.trim();

    // 1. Dedupe by (owner, lower(name)).
    const { data: existing } = await supabase
      .from("wallets")
      .select(AGENT_SELECT)
      .eq("is_ai", true)
      .eq("created_by_profile_id", params.ownerProfileId)
      .ilike("display_name", name)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { agent: existing as AiAgent, reused: true, identityError: null };
    }

    // 2-3. Mint a Circle SCA wallet + best-effort ERC-8004 identity.
    const { created, walletSetId, agentId, identityTxHash, identityError } =
      await provisionAgentWallet(supabase, {
        name,
        origin: params.origin,
        capabilities: params.capabilities,
      });

    // 4. Persist the agent (a wallet row, profile_id NULL, is_ai true).
    const { data: walletRow, error } = await supabase
      .from("wallets")
      .insert({
        profile_id: null,
        is_ai: true,
        display_name: name,
        origin: params.origin ?? null,
        capabilities: params.capabilities ?? null,
        created_by_profile_id: params.ownerProfileId,
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
      .select(AGENT_SELECT)
      .single();

    if (error || !walletRow) {
      throw new Error(`Failed to persist AI agent: ${error?.message ?? "unknown"}`);
    }

    return { agent: walletRow as AiAgent, reused: false, identityError };
  },

  /** List the caller's AI agents with works-contributed + total-earned stats. */
  async listAgents(ownerProfileId: string): Promise<AiAgentWithStats[]> {
    const { data: agents, error } = await supabase
      .from("wallets")
      .select(AGENT_SELECT)
      .eq("is_ai", true)
      .eq("created_by_profile_id", ownerProfileId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list AI agents: ${error.message}`);
    if (!agents?.length) return [];

    const ids = agents.map((a: any) => a.id);

    const { data: contribs } = await supabase
      .from("contributors")
      .select("wallet_id, work_id")
      .in("wallet_id", ids);

    const { data: payments } = await supabase
      .from("royalty_payments")
      .select("wallet_id, amount_usdc, status")
      .in("wallet_id", ids)
      .eq("status", "COMPLETE");

    // Paid validation work performed by these agents (distinct from royalties).
    const { data: validations } = await supabase
      .from("validations")
      .select("validator_wallet_id, fee_usdc, status")
      .in("validator_wallet_id", ids)
      .eq("status", "COMPLETE");

    const worksByWallet = new Map<string, Set<string>>();
    (contribs ?? []).forEach((c: any) => {
      if (!worksByWallet.has(c.wallet_id)) worksByWallet.set(c.wallet_id, new Set());
      worksByWallet.get(c.wallet_id)!.add(c.work_id);
    });

    const earnedByWallet = new Map<string, number>();
    (payments ?? []).forEach((p: any) => {
      earnedByWallet.set(
        p.wallet_id,
        (earnedByWallet.get(p.wallet_id) ?? 0) + Number(p.amount_usdc)
      );
    });

    const validationsByWallet = new Map<string, { count: number; fees: number }>();
    (validations ?? []).forEach((v: any) => {
      const cur = validationsByWallet.get(v.validator_wallet_id) ?? { count: 0, fees: 0 };
      cur.count += 1;
      cur.fees += Number(v.fee_usdc);
      validationsByWallet.set(v.validator_wallet_id, cur);
    });

    return agents.map((a: any) => ({
      ...(a as AiAgent),
      works_count: worksByWallet.get(a.id)?.size ?? 0,
      total_earned: earnedByWallet.get(a.id) ?? 0,
      validations_count: validationsByWallet.get(a.id)?.count ?? 0,
      fees_earned: validationsByWallet.get(a.id)?.fees ?? 0,
    }));
  },

  async getAgent(id: string): Promise<AiAgent | null> {
    const { data } = await supabase
      .from("wallets")
      .select(AGENT_SELECT)
      .eq("id", id)
      .eq("is_ai", true)
      .maybeSingle();
    return (data as AiAgent) ?? null;
  },
});
