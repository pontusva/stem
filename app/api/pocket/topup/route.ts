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
import { createStreamingService } from "@/app/services/streaming.service";
import { getCurrentUser } from "@/lib/utils/current-user";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { ARC, waitForCircleTx } from "@/lib/utils/arc";

export const dynamic = "force-dynamic";

/**
 * POST /api/pocket/topup  { amount }
 * Moves USDC on-chain from the user's Circle wallet to the Stem agent wallet
 * (the pocket custodian), then credits their internal pocket balance.
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user || !user.wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS;
  if (!agentAddress) {
    return NextResponse.json(
      { error: "Agent wallet not configured" },
      { status: 500 }
    );
  }

  let amount: number;
  try {
    const body = await req.json();
    amount = Number(body.amount);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  // Round to USDC precision.
  amount = Math.round(amount * 1_000_000) / 1_000_000;

  try {
    // Make sure the wallet can cover the top-up before we try to move funds.
    const balResp = await circleDeveloperSdk.getWalletTokenBalance({
      id: user.wallet.circle_wallet_id,
      includeAll: true,
    });
    const walletUsdc = Number(
      balResp.data?.tokenBalances?.find((b: any) => b.token.symbol === "USDC")?.amount ?? "0"
    );
    if (walletUsdc < amount) {
      return NextResponse.json(
        { error: `Wallet balance too low (have ${walletUsdc} USDC, need ${amount})` },
        { status: 400 }
      );
    }

    const transfer = await circleDeveloperSdk.createTransaction({
      walletId: user.wallet.circle_wallet_id,
      destinationAddress: agentAddress,
      amount: [amount.toFixed(6)],
      tokenAddress: ARC.USDC,
      blockchain: ARC.BLOCKCHAIN as any,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const transferId = transfer.data?.id;
    if (!transferId) throw new Error("top-up did not return a transaction id");

    await waitForCircleTx(transferId, "pocket top-up");

    const service = createSupabaseServiceClient();
    const streaming = createStreamingService(service);
    const balance = await streaming.creditTopup(
      user.wallet.id,
      user.profileId,
      amount,
      transferId
    );

    return NextResponse.json({ balance, transferId });
  } catch (error: any) {
    console.error("Pocket top-up failed:", error);
    return NextResponse.json(
      { error: `Failed to top up pocket: ${error.message}` },
      { status: 500 }
    );
  }
}
