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
import { createFingerprintService } from "@/app/services/fingerprint.service";
import { getCurrentUser } from "@/lib/utils/current-user";
import { bucketForFile, isAudioFile, extOf } from "@/lib/utils/work-files";

export const dynamic = "force-dynamic";

/**
 * POST /api/works/[id]/file — finalize an upload.
 *
 * The bytes are uploaded straight from the browser to Storage via a signed
 * upload URL (see ./sign), so this route only takes JSON: the stored `path`
 * and the client-measured `durationSeconds` (for audio). It records the file
 * URL + duration on the work. No file bytes pass through this function, so it's
 * not subject to the serverless request-body limit.
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
  const worksService = createWorksService(service);

  const { data: work } = await service
    .from("works")
    .select("id, owner_profile_id, parent_work_id")
    .eq("id", params.id)
    .single();
  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }
  if (work.owner_profile_id !== user.profileId) {
    return NextResponse.json(
      { error: "Only the work owner can attach its file" },
      { status: 403 }
    );
  }

  let path = "";
  let durationSeconds: unknown = undefined;
  try {
    const body = await req.json();
    path = String(body.path ?? "");
    durationSeconds = body.durationSeconds;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // The path must live under this work's folder (it was minted by ./sign).
  if (!path || !path.startsWith(`${params.id}/`)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const audio = isAudioFile(path);
  const bucket = bucketForFile(path);

  const { data: pub } = service.storage.from(bucket).getPublicUrl(path);

  // Store duration only for audio; round to ms. Omit (undefined) for non-audio
  // so a re-upload can't clobber an existing value.
  let duration: number | null | undefined = undefined;
  if (audio) {
    duration =
      typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds * 1000) / 1000
        : null;
  }

  await worksService.updateWorkFile(params.id, path, pub.publicUrl, duration);

  // ----- Originality gate -----
  // Compute a content hash (+ acoustic fingerprint for audio) and compare with
  // the catalog. A strong match holds the work in PENDING_ATTRIBUTION so the
  // owner is forced to declare it as a remix (→ 20% upstream) before publishing.
  let match: { workId: string; title: string; score: number } | null = null;
  const fpService = createFingerprintService(service);
  if (fpService.enabled()) {
    try {
      const { data: blob } = await service.storage.from(bucket).download(path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        const sha256 = fpService.sha256(buf);

        let fingerprint: number[] | null = null;
        let fpDuration: number | null = null;
        let matched: { workId: string; title: string; ownerProfileId: string; score: number } | null =
          null;

        // 1. Exact-duplicate fast path (any file type).
        const { data: hashDup } = await service
          .from("works")
          .select("id, title, owner_profile_id")
          .eq("file_sha256", sha256)
          .in("status", ["ACTIVE", "PENDING_ATTRIBUTION"])
          .neq("id", params.id)
          .limit(1)
          .maybeSingle();
        if (hashDup) {
          matched = {
            workId: hashDup.id,
            title: hashDup.title,
            ownerProfileId: hashDup.owner_profile_id,
            score: 1,
          };
        }

        // 2. Acoustic fingerprint (audio only) — robust to re-encoding/trimming.
        if (audio) {
          const fp = await fpService.fingerprint(buf, extOf(path));
          if (fp) {
            fingerprint = fp.fingerprint;
            fpDuration = Math.round(fp.duration);
            if (!matched) {
              matched = await fpService.findStrongMatch(
                fp.fingerprint,
                fp.duration,
                params.id
              );
            }
          }
        }

        // An honest remixer who already declared the matched work (directly or up
        // its provenance chain) as parent isn't plagiarising — let it through.
        let alreadyAttributed = false;
        if (matched) {
          if (work.parent_work_id === matched.workId) {
            alreadyAttributed = true;
          } else if (work.parent_work_id) {
            const chain = await worksService.getProvenanceChain(params.id);
            alreadyAttributed = chain.some((w) => w.id === matched!.workId);
          }
        }

        await worksService.updateOriginality(params.id, {
          fileSha256: sha256,
          audioFingerprint: fingerprint,
          fingerprintDuration: fpDuration,
          ...(matched && !alreadyAttributed
            ? {
                status: "PENDING_ATTRIBUTION",
                suspectedParentWorkId: matched.workId,
                matchScore: matched.score,
              }
            : {}),
        });

        if (matched && !alreadyAttributed) {
          match = { workId: matched.workId, title: matched.title, score: matched.score };
        }
      }
    } catch (err: any) {
      // Never block an upload on a detector error — log and continue (fail-open).
      console.warn(`[originality] check failed (fail-open): ${err?.message ?? err}`);
    }
  }

  return NextResponse.json(
    {
      filePath: path,
      fileUrl: pub.publicUrl,
      durationSeconds: duration ?? null,
      match,
    },
    { status: 201 }
  );
}
