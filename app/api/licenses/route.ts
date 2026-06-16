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
import {
  createLicenseService,
  ValidationRejectedError,
} from "@/app/services/license.service";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { getCurrentUser } from "@/lib/utils/current-user";

export const dynamic = "force-dynamic";

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
 * POST /api/licenses — buy a derivative license with an INSTANT direct payment.
 * The buyer's Circle wallet pays every contributor their split immediately
 * (no escrow), then the license is granted and download + remix unlock.
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

  const service = createSupabaseServiceClient();
  const licenseService = createLicenseService(service);

  try {
    const { workId, amountUsdc } = await req.json();
    if (!workId) {
      return NextResponse.json({ error: "workId is required" }, { status: 400 });
    }

    const { data: work } = await service
      .from("works")
      .select(
        "id, title, description, work_type, file_path, file_url, duration_seconds, license_price, owner_profile_id"
      )
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
      .not("status", "in", "(FAILED,REFUNDED,REJECTED)")
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

    // Make sure the buyer can cover the price before any funds move.
    const balResp = await circleDeveloperSdk.getWalletTokenBalance({
      id: user.wallet.circle_wallet_id,
      includeAll: true,
    });
    const walletUsdc = Number(
      balResp.data?.tokenBalances?.find((b: any) => b.token.symbol === "USDC")?.amount ?? "0"
    );
    if (walletUsdc < amount) {
      return NextResponse.json(
        { error: `Wallet balance too low — you need ${amount} USDC. Top up and try again.` },
        { status: 400 }
      );
    }

    const { license, payments, validation } = await licenseService.purchaseInstant({
      work: work as any,
      buyerProfileId: user.profileId,
      buyerWalletId: user.wallet.id,
      buyerCircleWalletId: user.wallet.circle_wallet_id,
      amountUsdc: amount,
    });

    return NextResponse.json({ license, payments, validation }, { status: 201 });
  } catch (error: any) {
    // The AI validator rejected the work — no money moved. 422, with the reason.
    if (error instanceof ValidationRejectedError) {
      return NextResponse.json(
        {
          error: "rejected",
          verdict: "FAIL",
          reasoning: error.reasoning,
          confidence: error.confidence,
        },
        { status: 422 }
      );
    }
    console.error("License purchase failed:", error);
    return NextResponse.json(
      { error: `Failed to buy license: ${error.message}` },
      { status: 500 }
    );
  }
}
