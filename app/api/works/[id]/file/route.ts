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
import { parseBuffer } from "music-metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";
import { getCurrentUser } from "@/lib/utils/current-user";

const WORKS_BUCKET = "works-files";
const STEMS_BUCKET = "stems";

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac"];

/**
 * Audio stems live in their own public "stems" bucket so they can be streamed
 * from the work detail page; everything else (images, pdfs) stays in works-files.
 */
function isAudio(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith("audio/")) return true;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Parse the file with music-metadata to prove it's genuinely decodable audio
 * (not just an audio extension/MIME) and pull out its playback duration.
 * Throws if the bytes aren't a recognizable audio stream.
 */
async function validateAudio(
  file: Blob,
  fileName: string
): Promise<{ durationSeconds: number | null }> {
  const buffer = Buffer.from(await file.arrayBuffer());

  let metadata;
  try {
    metadata = await parseBuffer(buffer, {
      mimeType: file.type || undefined,
      path: fileName,
      size: buffer.length,
    });
  } catch {
    throw new Error("File is not a valid audio file");
  }

  // A real audio stream resolves to a known container/codec.
  if (!metadata.format.container && !metadata.format.codec) {
    throw new Error("File is not a valid audio file");
  }

  const duration = metadata.format.duration;
  return {
    durationSeconds:
      typeof duration === "number" && Number.isFinite(duration)
        ? Math.round(duration * 1000) / 1000
        : null,
  };
}

/**
 * POST /api/works/[id]/file — upload the work's creative file (multipart form,
 * field "file") to the public works-files bucket and attach it to the work.
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

  try {
    const service = createSupabaseServiceClient();
    const worksService = createWorksService(service);

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

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const originalName = (file as File).name || "work";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${params.id}/${Date.now()}-${safeName}`;
    const audio = isAudio(originalName, file.type);
    const bucket = audio ? STEMS_BUCKET : WORKS_BUCKET;

    // For audio, validate the bytes really are decodable audio (and grab its
    // duration) before we commit anything to storage.
    let durationSeconds: number | null | undefined = undefined;
    if (audio) {
      try {
        ({ durationSeconds } = await validateAudio(file, originalName));
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || "File is not a valid audio file" },
          { status: 400 }
        );
      }
    }

    const { error: uploadError } = await service.storage
      .from(bucket)
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: pub } = service.storage
      .from(bucket)
      .getPublicUrl(filePath);

    await worksService.updateWorkFile(
      params.id,
      filePath,
      pub.publicUrl,
      durationSeconds
    );

    return NextResponse.json(
      { filePath, fileUrl: pub.publicUrl, durationSeconds: durationSeconds ?? null },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to upload file: ${error.message}` },
      { status: 500 }
    );
  }
}
