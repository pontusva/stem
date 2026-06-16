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
import { STREAM_RATE_USDC_PER_MINUTE } from "@/lib/utils/streaming";

export const dynamic = "force-dynamic";

/**
 * POST /api/works/[id]/stream  { secondsPlayed, end? }
 * Streaming heartbeat. Charges $0.001 per newly-completed minute of listening,
 * split to the work's contributors via the listener's internal pocket. The
 * work owner and its contributors listen free (progress tracked, not charged).
 * `end: true` flushes a final charge and closes the session.
 *
 * (Mode 2 / x402 will return HTTP 402 here for external-wallet listeners; Mode
 *  1 always responds 200 and signals a low balance via `paused`.)
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
  if (!user.wallet) {
    return NextResponse.json(
      { error: "Your account has no wallet yet" },
      { status: 400 }
    );
  }

  let secondsPlayed = 0;
  let end = false;
  try {
    const body = await req.json();
    secondsPlayed = Math.floor(Number(body.secondsPlayed) || 0);
    end = !!body.end;
  } catch {
    // tolerate empty/sendBeacon bodies — treat as a zero-progress ping
  }

  const service = createSupabaseServiceClient();
  const streaming = createStreamingService(service);

  try {
    const { data: work } = await service
      .from("works")
      .select("id, owner_profile_id")
      .eq("id", params.id)
      .single();
    if (!work) {
      return NextResponse.json({ error: "Work not found" }, { status: 404 });
    }

    // Owners, contributors, and valid license holders listen for free.
    let free = work.owner_profile_id === user.profileId;
    if (!free) {
      const { data: contrib } = await service
        .from("contributors")
        .select("id")
        .eq("work_id", params.id)
        .or(`profile_id.eq.${user.profileId},wallet_id.eq.${user.wallet.id}`)
        .limit(1);
      free = (contrib?.length ?? 0) > 0;
    }
    if (!free) {
      const { data: license } = await service
        .from("licenses")
        .select("id")
        .eq("work_id", params.id)
        .eq("buyer_profile_id", user.profileId)
        .not("status", "in", "(FAILED,REFUNDED)")
        .limit(1);
      free = (license?.length ?? 0) > 0;
    }

    await streaming.getOrCreatePocket(user.wallet.id, user.profileId);
    const session = await streaming.startSession(
      params.id,
      user.profileId,
      user.wallet.id
    );

    if (free) {
      const safeSeconds = Math.max(session.seconds_played, secondsPlayed);
      if (safeSeconds > session.seconds_played || end) {
        await service
          .from("stream_sessions")
          .update({
            seconds_played: safeSeconds,
            ...(end ? { status: "ENDED" } : {}),
          })
          .eq("id", session.id);
      }
      const pocketBalance = await streaming.getPocketBalance(user.wallet.id);
      return NextResponse.json({
        sessionId: session.id,
        secondsPlayed: safeSeconds,
        minutesCharged: 0,
        amountCharged: 0,
        pocketBalance,
        rate: STREAM_RATE_USDC_PER_MINUTE,
        free: true,
        status: end ? "ENDED" : "ACTIVE",
      });
    }

    const result = end
      ? await streaming.endSession(session, secondsPlayed)
      : await streaming.chargeForSeconds(session, secondsPlayed);

    return NextResponse.json({ ...result, free: false });
  } catch (error: any) {
    console.error("Stream charge failed:", error);
    return NextResponse.json(
      { error: `Streaming failed: ${error.message}` },
      { status: 500 }
    );
  }
}
