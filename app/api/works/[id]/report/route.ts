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

export const dynamic = "force-dynamic";

const VALID_REASONS = ["PLAGIARISM", "OTHER"];

/**
 * POST /api/works/[id]/report  { reason?, details? }
 * File a plagiarism/abuse report against a work. The human safety net behind
 * automated detection — an admin later upholds (→ takedown) or dismisses it.
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

  let reason = "PLAGIARISM";
  let details: string | null = null;
  try {
    const body = await req.json();
    if (body.reason && VALID_REASONS.includes(body.reason)) reason = body.reason;
    if (typeof body.details === "string") details = body.details.slice(0, 2000);
  } catch {
    // tolerate an empty body — default to a PLAGIARISM report
  }

  const service = createSupabaseServiceClient();

  const { data: work } = await service
    .from("works")
    .select("id, owner_profile_id")
    .eq("id", params.id)
    .single();
  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }
  if (work.owner_profile_id === user.profileId) {
    return NextResponse.json(
      { error: "You can't report your own work" },
      { status: 400 }
    );
  }

  // One open report per reporter per work — avoid spam / duplicates.
  const { data: existing } = await service
    .from("work_reports")
    .select("id")
    .eq("work_id", params.id)
    .eq("reporter_profile_id", user.profileId)
    .eq("status", "OPEN")
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "You've already reported this work — we're looking into it." },
      { status: 409 }
    );
  }

  const { error } = await service.from("work_reports").insert({
    work_id: params.id,
    reporter_profile_id: user.profileId,
    reason,
    details,
  });
  if (error) {
    return NextResponse.json(
      { error: `Could not file report: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
