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

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createStreamingService } from "@/app/services/streaming.service";
import { getCurrentUser } from "@/lib/utils/current-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/pocket/withdraw
 * Sends the caller's full pocket balance on-chain from the agent (custodian)
 * wallet to their own Circle wallet address.
 */
export async function POST() {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user || !user.wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const streaming = createStreamingService(service);

  try {
    // The withdrawable set must match what the earnings card sums: the user's
    // own wallet(s) PLUS the AI-agent wallets they created.
    const walletIds = await streaming.getOwnedWalletIds(user.profileId);

    const { amount, transferId } = await streaming.withdraw(
      walletIds,
      user.wallet.wallet_address
    );
    return NextResponse.json({ amount, transferId });
  } catch (error: any) {
    const message = error?.message || "Failed to withdraw";
    const status = message === "Nothing to withdraw" ? 400 : 500;
    if (status === 500) console.error("Pocket withdrawal failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
