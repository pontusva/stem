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

const STEMS_BUCKET = "stems";
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac"];
/** Short expiry so a leaked URL is useless within a minute; the player refreshes. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * GET /api/works/[id]/audio-url
 * Mints a short-lived signed URL for a work's audio file in the private "stems"
 * bucket. Authenticated users only — signed-out callers get 401 and therefore
 * no way to reach the bytes. (Per-minute billing / preview limits are enforced
 * by the player; this route only gates access behind authentication.)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // `?download=1` signs the URL with attachment disposition (used by the
  // licensed download button); streaming omits it so audio plays inline.
  const asDownload = new URL(req.url).searchParams.get("download") != null;

  const service = createSupabaseServiceClient();
  const { data: work } = await service
    .from("works")
    .select("id, file_path, file_url")
    .eq("id", params.id)
    .single();

  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }

  const ext = (work.file_url || work.file_path || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (!work.file_path || !ext || !AUDIO_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: "This work has no streamable audio" },
      { status: 404 }
    );
  }

  const { data, error } = await service.storage
    .from(STEMS_BUCKET)
    .createSignedUrl(work.file_path, SIGNED_URL_TTL_SECONDS, {
      download: asDownload,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: `Could not sign audio URL: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
