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
import { createWorksService } from "@/app/services/works.service";
import { getCurrentUser } from "@/lib/utils/current-user";
import { WorkType } from "@/types/royalty";

export const dynamic = "force-dynamic";

const VALID_TYPES: WorkType[] = ["music", "art", "writing"];

/** GET /api/works — public catalog of all registered works. */
export async function GET() {
  try {
    const service = createSupabaseServiceClient();
    const worksService = createWorksService(service);
    const works = await worksService.listWorks();
    return NextResponse.json({ works });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to list works: ${error.message}` },
      { status: 500 }
    );
  }
}

/** POST /api/works — register a new creative work owned by the caller. */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, workType, parentWorkId, licensePrice } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(workType)) {
      return NextResponse.json(
        { error: `workType must be one of ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const price = Number(licensePrice);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: "licensePrice must be a non-negative number" },
        { status: 400 }
      );
    }

    const service = createSupabaseServiceClient();
    const worksService = createWorksService(service);

    const work = await worksService.createWork({
      ownerProfileId: user.profileId,
      title: title.trim(),
      description: description?.toString().trim() ?? null,
      workType,
      parentWorkId: parentWorkId || null,
      licensePrice: price,
    });

    return NextResponse.json({ work }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to create work: ${error.message}` },
      { status: 500 }
    );
  }
}
