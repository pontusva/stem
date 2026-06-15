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
import { createLicenseService } from "@/app/services/license.service";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { getCurrentUser } from "@/lib/utils/current-user";
import {
  ARC,
  toUsdcUnits,
  waitForCircleTx,
  arcPublicClient,
  AGENTIC_COMMERCE_ABI,
} from "@/lib/utils/arc";

const ALREADY_FUNDED_STATES = ["FUNDED", "SUBMITTED", "COMPLETED", "SPLITTING", "CLOSED"];

/**
 * POST /api/licenses/[id]/fund
 * Buyer approves the ERC-8183 contract to pull USDC, then funds the escrow.
 * Moves the on-chain job Open -> Funded.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user || !user.wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const licenseService = createLicenseService(service);

  try {
    const license = await licenseService.getLicense(params.id);
    if (!license) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }
    if (license.buyer_profile_id !== user.profileId) {
      return NextResponse.json(
        { error: "Only the buyer can fund this license" },
        { status: 403 }
      );
    }
    if (!license.onchain_job_id) {
      return NextResponse.json(
        { error: "License job has not been created yet" },
        { status: 400 }
      );
    }

    // Idempotency: if the DB already records funded-or-beyond, no-op.
    if (ALREADY_FUNDED_STATES.includes(license.status)) {
      return NextResponse.json({ status: license.status });
    }

    // Self-heal: the escrow may already be funded on-chain even if the DB lags
    // (e.g. a duplicate click). Funding an already-funded job reverts, so check
    // the on-chain job state first. ERC-8183 status: 0=Open, 1=Funded, ...
    const job: any = await arcPublicClient.readContract({
      address: ARC.AGENTIC_COMMERCE as `0x${string}`,
      abi: AGENTIC_COMMERCE_ABI,
      functionName: "getJob",
      args: [BigInt(license.onchain_job_id)],
    });
    if (Number(job.status) >= 1) {
      await licenseService.updateStatus(license.id, "FUNDED");
      return NextResponse.json({ status: "FUNDED" });
    }

    const amountUnits = toUsdcUnits(license.amount_usdc);

    // 1. approve(AgenticCommerce, amount) on USDC — buyer wallet.
    const approve = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: user.wallet.circle_wallet_id,
      contractAddress: ARC.USDC,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [ARC.AGENTIC_COMMERCE, amountUnits],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const approveTxId = approve.data?.id;
    if (!approveTxId) throw new Error("approve did not return a transaction id");
    await waitForCircleTx(approveTxId, "approve USDC");

    await licenseService.updateStatus(license.id, "APPROVED");

    // 2. fund(jobId) — buyer wallet escrows the budget.
    const fund = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: user.wallet.circle_wallet_id,
      contractAddress: ARC.AGENTIC_COMMERCE,
      abiFunctionSignature: "fund(uint256,bytes)",
      abiParameters: [license.onchain_job_id, "0x"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const fundTxId = fund.data?.id;
    if (!fundTxId) throw new Error("fund did not return a transaction id");
    await waitForCircleTx(fundTxId, "fund escrow");

    await licenseService.updateStatus(license.id, "FUNDED");

    return NextResponse.json({ status: "FUNDED" });
  } catch (error: any) {
    console.error("Funding failed:", error);
    return NextResponse.json(
      { error: `Failed to fund license: ${error.message}` },
      { status: 500 }
    );
  }
}
