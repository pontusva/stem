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

/** Shared work-file storage helpers (used by upload routes and the browser). */

export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac"];
export const STEMS_BUCKET = "stems"; // private — audio, served via signed URLs
export const WORKS_BUCKET = "works-files"; // public — images / pdfs / text

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isAudioFile(name: string, mimeType = ""): boolean {
  if (mimeType.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.includes(extOf(name));
}

/** Audio goes to the private stems bucket; everything else to works-files. */
export function bucketForFile(name: string, mimeType = ""): string {
  return isAudioFile(name, mimeType) ? STEMS_BUCKET : WORKS_BUCKET;
}

/**
 * A content type to upload with. Browsers sometimes report an empty type for
 * audio (notably .flac); fall back to the extension so the bucket's
 * allowed_mime_types check passes.
 */
export function contentTypeForFile(name: string, mimeType = ""): string | undefined {
  return mimeType || MIME_BY_EXT[extOf(name)];
}

/** Storage object path for a work's file, sanitized + timestamped. */
export function safeStoragePath(workId: string, fileName: string): string {
  const safe = (fileName || "work").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${workId}/${Date.now()}-${safe}`;
}
