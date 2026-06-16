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

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { contentTypeForFile, isAudioFile } from "@/lib/utils/work-files";

/** Read an audio file's duration in the browser (null if not audio / undecodable). */
export function readAudioDuration(file: File): Promise<number | null> {
  if (!isAudioFile(file.name, file.type)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/**
 * Upload a work file straight from the browser to Supabase Storage, bypassing
 * the serverless request-body limit:
 *   1. measure audio duration locally,
 *   2. ask the server for a one-time signed upload URL,
 *   3. upload the bytes directly to Storage,
 *   4. finalize (record path + URL + duration on the work).
 */
export async function uploadWorkFile(
  workId: string,
  file: File
): Promise<{ durationSeconds: number | null }> {
  const durationSeconds = await readAudioDuration(file);
  const contentType = contentTypeForFile(file.name, file.type);

  const signRes = await fetch(`/api/works/${workId}/file/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error || "Could not start upload");

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(sign.bucket)
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const finRes = await fetch(`/api/works/${workId}/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sign.path, durationSeconds }),
  });
  const fin = await finRes.json();
  if (!finRes.ok) throw new Error(fin.error || "Could not save file");

  return { durationSeconds };
}
