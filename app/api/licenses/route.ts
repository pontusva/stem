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
  getJobIdFromTxHash,
} from "@/lib/utils/arc";

export const dynamic = "force-dynamic";

const LICENSE_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** GET /api/licenses — caller's licenses (as buyer and as work owner). */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const service = createSupabaseServiceClient();

    const { data: asBuyer } = await service
      .from("licenses")
      .select(`*, work:works!licenses_work_id_fkey ( id, title, work_type )`)
      .eq("buyer_profile_id", user.profileId)
      .order("created_at", { ascending: false });

    const { data: ownedWorks } = await service
      .from("works")
      .select("id")
      .eq("owner_profile_id", user.profileId);
    const ownedIds = (ownedWorks ?? []).map((w: any) => w.id);

    let asOwner: any[] = [];
    if (ownedIds.length) {
      const { data } = await service
        .from("licenses")
        .select(`*, work:works!licenses_work_id_fkey ( id, title, work_type )`)
        .in("work_id", ownedIds)
        .order("created_at", { ascending: false });
      asOwner = data ?? [];
    }

    return NextResponse.json({ asBuyer: asBuyer ?? [], asOwner });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to list licenses: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/licenses — start licensing a work.
 * Creates the ERC-8183 job (buyer-signed) and sets its budget (agent-signed),
 * leaving the license ready to be funded.
 * Body: { workId: string, amountUsdc?: number }
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!user.wallet) {
    return NextResponse.json(
      { error: "Your account has no wallet" },
      { status: 400 }
    );
  }

  const agentAddress = process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS;
  const agentWalletId = process.env.NEXT_PUBLIC_AGENT_WALLET_ID;
  if (!agentAddress || !agentWalletId) {
    return NextResponse.json(
      { error: "Agent wallet is not configured" },
      { status: 500 }
    );
  }

  const service = createSupabaseServiceClient();
  const licenseService = createLicenseService(service);

  try {
    const { workId, amountUsdc } = await req.json();
    if (!workId) {
      return NextResponse.json({ error: "workId is required" }, { status: 400 });
    }

    const { data: work } = await service
      .from("works")
      .select("id, title, license_price, owner_profile_id")
      .eq("id", workId)
      .single();
    if (!work) {
      return NextResponse.json({ error: "Work not found" }, { status: 404 });
    }

    // You can't buy a license to your own work — the fee would just round-trip
    // back to you as a contributor.
    if (work.owner_profile_id === user.profileId) {
      return NextResponse.json(
        { error: "You can't license your own work — share it so others can." },
        { status: 403 }
      );
    }

    // You already hold a license to this work — no need to buy it twice.
    const { data: existingLicense } = await service
      .from("licenses")
      .select("id")
      .eq("work_id", workId)
      .eq("buyer_profile_id", user.profileId)
      .not("status", "in", "(FAILED,REFUNDED)")
      .limit(1);
    if (existingLicense && existingLicense.length > 0) {
      return NextResponse.json(
        { error: "You already own a license to this work — it's in your library." },
        { status: 409 }
      );
    }

    const amount = Number(amountUsdc ?? work.license_price);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "License amount must be greater than 0" },
        { status: 400 }
      );
    }

    const license = await licenseService.createLicense({
      workId,
      buyerProfileId: user.profileId,
      buyerWalletId: user.wallet.id,
      amountUsdc: amount,
    });

    const expiredAt = Math.floor(Date.now() / 1000) + LICENSE_DURATION_SECONDS;

    // 1. createJob — buyer is the on-chain client; agent is provider+evaluator.
    const createJob = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: user.wallet.circle_wallet_id,
      contractAddress: ARC.AGENTIC_COMMERCE,
      abiFunctionSignature: "createJob(address,address,uint256,string,address)",
      abiParameters: [
        agentAddress,
        agentAddress,
        expiredAt.toString(),
        `License: ${work.title}`,
        ARC.ZERO_ADDRESS,
      ],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const createJobTxId = createJob.data?.id;
    if (!createJobTxId) throw new Error("createJob did not return a transaction id");

    const { txHash } = await waitForCircleTx(createJobTxId, "createJob");
    if (!txHash) throw new Error("createJob did not produce a tx hash");

    const jobId = await getJobIdFromTxHash(txHash);

    await licenseService.updateStatus(license.id, "JOB_CREATED", {
      onchain_job_id: jobId,
      job_tx_hash: txHash,
    });

    // 2. setBudget — agent (provider) sets the job price in USDC base units.
    const setBudget = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: agentWalletId,
      contractAddress: ARC.AGENTIC_COMMERCE,
      abiFunctionSignature: "setBudget(uint256,uint256,bytes)",
      abiParameters: [jobId, toUsdcUnits(amount), "0x"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const setBudgetTxId = setBudget.data?.id;
    if (setBudgetTxId) {
      await waitForCircleTx(setBudgetTxId, "setBudget");
    }

    await licenseService.updateStatus(license.id, "BUDGETED");

    return NextResponse.json(
      { license: { ...license, status: "BUDGETED", onchain_job_id: jobId } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("License creation failed:", error);
    return NextResponse.json(
      { error: `Failed to create license: ${error.message}` },
      { status: 500 }
    );
  }
}
