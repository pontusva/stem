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

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createContributorService } from "@/app/services/contributor.service";
import { getCurrentUser } from "@/lib/utils/current-user";
import { ContributorInput } from "@/types/royalty";

interface IncomingContributor {
  contributor_type: "human" | "ai";
  display_name: string;
  split_pct: number;
  wallet_id?: string;
  email?: string;
  profile_id?: string | null;
  erc8004_agent_id?: string | null;
  erc8004_tx_hash?: string | null;
}

/**
 * POST /api/works/[id]/contributors
 * Body: { contributors: IncomingContributor[] }
 * AI rows must carry a wallet_id (from /api/ai-wallet). Human rows carry either
 * a wallet_id or an email that resolves to a registered user's wallet.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const service = createSupabaseServiceClient();
    const contributorService = createContributorService(service);

    // Verify the work exists and is owned by the caller.
    const { data: work } = await service
      .from("works")
      .select("id, owner_profile_id")
      .eq("id", params.id)
      .single();
    if (!work) {
      return NextResponse.json({ error: "Work not found" }, { status: 404 });
    }
    if (work.owner_profile_id !== user.profileId) {
      return NextResponse.json(
        { error: "Only the work owner can set contributors" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const incoming: IncomingContributor[] = body.contributors;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json(
        { error: "contributors array is required" },
        { status: 400 }
      );
    }

    // Resolve each row to a concrete wallet_id.
    const resolved: ContributorInput[] = [];
    for (const c of incoming) {
      let walletId = c.wallet_id;
      let profileId = c.profile_id ?? null;

      if (!walletId && c.contributor_type === "human" && c.email) {
        const match = await contributorService.resolveHumanWalletByEmail(
          c.email.trim()
        );
        if (!match) {
          return NextResponse.json(
            { error: `No registered wallet for ${c.email}` },
            { status: 400 }
          );
        }
        walletId = match.walletId;
        profileId = match.profileId;
      }

      if (!walletId) {
        return NextResponse.json(
          { error: `Contributor "${c.display_name}" is missing a wallet` },
          { status: 400 }
        );
      }

      // For AI contributors, source the onchain identity from the agent's wallet
      // when the form didn't pass it (e.g. an existing agent).
      let erc8004AgentId = c.erc8004_agent_id ?? null;
      let erc8004TxHash = c.erc8004_tx_hash ?? null;
      if (c.contributor_type === "ai" && !erc8004AgentId) {
        const { data: w } = await service
          .from("wallets")
          .select("erc8004_agent_id, erc8004_tx_hash")
          .eq("id", walletId)
          .maybeSingle();
        if (w) {
          erc8004AgentId = w.erc8004_agent_id;
          erc8004TxHash = w.erc8004_tx_hash;
        }
      }

      resolved.push({
        contributor_type: c.contributor_type,
        display_name: c.display_name,
        split_pct: Number(c.split_pct),
        wallet_id: walletId,
        profile_id: profileId,
        erc8004_agent_id: erc8004AgentId,
        erc8004_tx_hash: erc8004TxHash,
      });
    }

    const contributors = await contributorService.addContributors(
      params.id,
      resolved
    );

    return NextResponse.json({ contributors }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Failed to add contributors" },
      { status: 400 }
    );
  }
}
