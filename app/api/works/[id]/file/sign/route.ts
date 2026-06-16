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
import { bucketForFile, safeStoragePath } from "@/lib/utils/work-files";

export const dynamic = "force-dynamic";

/**
 * POST /api/works/[id]/file/sign  { fileName, contentType }
 * Returns a one-time signed upload URL so the browser can upload the file
 * bytes DIRECTLY to Supabase Storage — bypassing the serverless request-body
 * limit (audio masters can be tens of MB). The client then calls
 * POST /api/works/[id]/file with the resulting path to finalize.
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

  const service = createSupabaseServiceClient();
  const { data: work } = await service
    .from("works")
    .select("id, owner_profile_id")
    .eq("id", params.id)
    .single();
  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }
  if (work.owner_profile_id !== user.profileId) {
    return NextResponse.json(
      { error: "Only the work owner can upload its file" },
      { status: 403 }
    );
  }

  let fileName = "";
  let contentType = "";
  try {
    const body = await req.json();
    fileName = String(body.fileName ?? "");
    contentType = String(body.contentType ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const bucket = bucketForFile(fileName, contentType);
  const path = safeStoragePath(params.id, fileName);

  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: `Could not start upload: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ bucket, path, token: data.token });
}
