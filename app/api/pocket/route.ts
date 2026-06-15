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
import { STREAM_RATE_USDC_PER_MINUTE } from "@/lib/utils/streaming";

export const dynamic = "force-dynamic";

/** GET /api/pocket — the current user's pocket balance + recent ledger. */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user || !user.wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const streaming = createStreamingService(service);

  await streaming.getOrCreatePocket(user.wallet.id, user.profileId);
  const [balance, ledger] = await Promise.all([
    streaming.getPocketBalance(user.wallet.id),
    streaming.getLedger(user.wallet.id),
  ]);

  return NextResponse.json({ balance, ledger, rate: STREAM_RATE_USDC_PER_MINUTE });
}
