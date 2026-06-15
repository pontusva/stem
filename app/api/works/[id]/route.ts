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
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";

export const dynamic = "force-dynamic";

/** GET /api/works/[id] — work detail with contributors and provenance chain. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const service = createSupabaseServiceClient();
    const worksService = createWorksService(service);

    const work = await worksService.getWork(params.id);
    if (!work) {
      return NextResponse.json({ error: "Work not found" }, { status: 404 });
    }

    const provenance = await worksService.getProvenanceChain(params.id);

    return NextResponse.json({ work, provenance });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to fetch work: ${error.message}` },
      { status: 500 }
    );
  }
}
