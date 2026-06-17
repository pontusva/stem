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
import { AUDIO_EXTENSIONS, STEMS_BUCKET, extOf } from "@/lib/utils/work-files";

export const dynamic = "force-dynamic";

/** Internal TTL on the server-side signed URL — never leaves this process. */
const SIGNED_URL_TTL_SECONDS = 60;
/** Free listening allowance (seconds) before a metered listener must pay. */
const FREE_SECONDS = 60;

/**
 * GET /api/works/[id]/audio
 * Same-origin streaming proxy for a work's audio in the private "stems" bucket.
 *
 * The Supabase signed URL is minted and consumed entirely server-side and never
 * reaches the browser, so a URL copied from the network tab is just this route —
 * useless without the caller's session cookie. Access is gated here:
 *  - must be signed in (401),
 *  - `?download=1` requires entitlement: owner / contributor / licensee (403),
 *  - a metered listener whose pocket is empty after the free allowance gets 402.
 * Per-minute charging stays in the /stream heartbeat.
 *
 * Range requests are forwarded to Storage and the 206 response is piped back so
 * the <audio> element can seek normally.
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

  const asDownload =
    new URL(req.url).searchParams.get("download") != null;

  const service = createSupabaseServiceClient();
  const { data: work } = await service
    .from("works")
    .select("id, file_path, file_url, owner_profile_id")
    .eq("id", params.id)
    .single();

  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }

  const ext = extOf(work.file_url || work.file_path || "");
  if (!work.file_path || !ext || !AUDIO_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: "This work has no streamable audio" },
      { status: 404 }
    );
  }

  const streaming = createStreamingService(service);
  const { free } = await streaming.getEntitlement(
    params.id,
    work.owner_profile_id,
    user.profileId,
    user.wallet?.id ?? null
  );

  // Downloads are entitlement-gated — only owners/contributors/licensees may
  // pull the file off-platform.
  if (asDownload && !free) {
    return NextResponse.json(
      { error: "You need a license to download this stem" },
      { status: 403 }
    );
  }

  // Pocket gate for metered listeners: once the free allowance is spent and the
  // pocket is empty, refuse to serve more bytes (the heartbeat does the charging).
  if (!asDownload && !free && user.wallet) {
    const session = await streaming.getActiveSession(params.id, user.profileId);
    if (session && session.seconds_played >= FREE_SECONDS) {
      const balance = await streaming.getPocketBalance(user.wallet.id);
      if (balance <= 0) {
        return NextResponse.json(
          { error: "Your pocket is empty — top up to keep listening" },
          { status: 402 }
        );
      }
    }
  }

  // Mint a short-lived signed URL and consume it here; it never reaches the client.
  const { data: signed, error: signError } = await service.storage
    .from(STEMS_BUCKET)
    .createSignedUrl(work.file_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: `Could not access audio: ${signError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const range = req.headers.get("range");
  const upstream = await fetch(signed.signedUrl, {
    headers: range ? { Range: range } : {},
    // Pass through abort if the client disconnects.
    signal: req.signal,
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Could not load audio" },
      { status: upstream.status === 416 ? 416 : 502 }
    );
  }

  const headers = new Headers();
  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "last-modified",
    "etag",
  ];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  if (asDownload) {
    const base = work.file_path.split("/").pop() ?? `stem.${ext}`;
    const filename = base.replace(/^\d+-/, ""); // drop the timestamp prefix
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, "")}"`
    );
  }

  return new Response(upstream.body, {
    status: upstream.status, // 200 or 206
    headers,
  });
}
