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
import { getCurrentUser } from "@/lib/utils/current-user";
import { isAdminProfile } from "@/lib/utils/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/works/[id]/takedown  { action: "uphold" | "dismiss" }
 * Admin resolution of reports against a work. "uphold" delists the work
 * (status BLOCKED) and marks its open reports UPHELD; "dismiss" closes the open
 * reports as DISMISSED and leaves the work as-is.
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
  if (!isAdminProfile(user.profileId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let action = "uphold";
  try {
    const body = await req.json();
    if (body.action === "dismiss" || body.action === "uphold") action = body.action;
  } catch {
    // default to uphold
  }

  const service = createSupabaseServiceClient();

  const { data: work } = await service
    .from("works")
    .select("id")
    .eq("id", params.id)
    .single();
  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }

  const resolution = {
    status: action === "uphold" ? "UPHELD" : "DISMISSED",
    resolver_profile_id: user.profileId,
    resolved_at: new Date().toISOString(),
  };
  await service
    .from("work_reports")
    .update(resolution)
    .eq("work_id", params.id)
    .eq("status", "OPEN");

  if (action === "uphold") {
    const { error } = await service
      .from("works")
      .update({ status: "BLOCKED" })
      .eq("id", params.id);
    if (error) {
      return NextResponse.json(
        { error: `Could not take down work: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, action });
}
