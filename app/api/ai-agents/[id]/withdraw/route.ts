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
 * POST /api/ai-agents/[id]/withdraw
 * Withdraw an AI agent's streaming pocket on-chain to the agent's OWN wallet —
 * so the agent holds its streaming income just like its royalties. Only the
 * human who created the agent may trigger this.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();

  // Load the agent wallet and verify the caller created it.
  const { data: agent } = await service
    .from("wallets")
    .select("id, wallet_address, is_ai, created_by_profile_id")
    .eq("id", params.id)
    .eq("is_ai", true)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "AI agent not found" }, { status: 404 });
  }
  if (agent.created_by_profile_id !== user.profileId) {
    return NextResponse.json(
      { error: "You can only withdraw for an AI agent you created" },
      { status: 403 }
    );
  }
  if (!agent.wallet_address) {
    return NextResponse.json(
      { error: "Agent has no wallet address" },
      { status: 400 }
    );
  }

  try {
    const { amount, transferId } = await createStreamingService(service).withdraw(
      [agent.id],
      agent.wallet_address
    );
    return NextResponse.json({ amount, transferId });
  } catch (error: any) {
    const message = error?.message || "Failed to withdraw";
    const status = message === "Nothing to withdraw" ? 400 : 500;
    if (status === 500) console.error("Agent pocket withdrawal failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
