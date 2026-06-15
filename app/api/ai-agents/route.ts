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
import { createAiAgentService } from "@/app/services/ai-agent.service";
import { getCurrentUser } from "@/lib/utils/current-user";

export const dynamic = "force-dynamic";

/** GET /api/ai-agents — the caller's reusable AI agents (with stats). */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const service = createAiAgentService(createSupabaseServiceClient());
    const agents = await service.listAgents(user.profileId);
    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to list AI agents: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-agents — create (or reuse) an AI agent.
 * Body: { displayName, origin?, capabilities? }
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { displayName, origin, capabilities } = await req.json();
    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      return NextResponse.json(
        { error: "displayName is required" },
        { status: 400 }
      );
    }

    const service = createAiAgentService(createSupabaseServiceClient());
    const { agent, reused, identityError } = await service.createOrGetAgent({
      ownerProfileId: user.profileId,
      displayName,
      origin: origin ?? null,
      capabilities: capabilities ?? null,
    });

    return NextResponse.json(
      { agent, reused, identityError },
      { status: reused ? 200 : 201 }
    );
  } catch (error: any) {
    console.error("AI agent creation failed:", error);
    return NextResponse.json(
      { error: `Failed to create AI agent: ${error.message}` },
      { status: 500 }
    );
  }
}
