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

import { SupabaseClient } from "@supabase/supabase-js";
import { bucketForFile, extOf, WORKS_BUCKET } from "@/lib/utils/work-files";
import type { EvidenceKind, Work } from "@/types/royalty";

/**
 * Gathers the actual evidence the STEM Validator reviews. The bytes are
 * downloaded server-side with the service-role client (bypasses storage RLS /
 * the private stems bucket), then turned into Anthropic content blocks:
 *
 *   - writing (.txt/.md/.pdf/.docx) → extracted text (Claude reads the content)
 *   - art / image                   → a vision image block (Claude sees it)
 *   - music / audio                 → metadata only (Claude can't listen)
 */

/** Image media types Claude vision accepts. */
const IMAGE_MEDIA: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const TEXT_EXTS = ["txt", "md", "markdown"];

/** ~60k chars keeps us comfortably inside the context budget for long docs. */
const TEXT_CHAR_BUDGET = 60_000;

/** Structurally compatible with Anthropic's ContentBlockParam (text + image). */
export type EvidenceBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    };

export interface WorkEvidence {
  blocks: EvidenceBlock[];
  evidenceKind: EvidenceKind;
  truncated: boolean;
}

type WorkForEvidence = Pick<
  Work,
  "title" | "description" | "work_type" | "file_path" | "file_url" | "duration_seconds"
>;

/** Download a work's stored file into a Buffer, or null if unavailable. */
async function downloadFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<Buffer | null> {
  const bucket = bucketForFile(filePath);
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Extract plain text from a writing file by extension. */
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  if (ext === "pdf") {
    // Import the lib entry point directly to avoid pdf-parse's debug self-test.
    // @ts-expect-error - the pdf-parse lib subpath ships no type declarations
    const mod: any = await import("pdf-parse/lib/pdf-parse.js");
    const pdf = mod.default ?? mod;
    const parsed = await pdf(buffer);
    return parsed.text ?? "";
  }
  if (ext === "docx") {
    const mammoth: any = await import("mammoth");
    const result = await (mammoth.default ?? mammoth).extractRawText({ buffer });
    return result.value ?? "";
  }
  // txt / md / markdown / anything else → decode as UTF-8.
  return buffer.toString("utf-8");
}

/** A short, human-readable metadata framing included in every prompt. */
function metadataText(work: WorkForEvidence): string {
  const lines = [
    `Title: ${work.title}`,
    `Type: ${work.work_type}`,
    work.description ? `Declared description: ${work.description}` : null,
    work.duration_seconds != null ? `Duration (s): ${work.duration_seconds}` : null,
    work.file_path ? `File: ${work.file_path.split("/").pop()}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function gatherWorkEvidence(
  supabase: SupabaseClient,
  work: WorkForEvidence
): Promise<WorkEvidence> {
  const ext = extOf(work.file_path ?? work.file_url ?? "");
  const meta = metadataText(work);

  // ----- art / image: Claude vision -----
  if (work.work_type === "art" || ext in IMAGE_MEDIA) {
    const mediaType = IMAGE_MEDIA[ext];
    let buffer: Buffer | null = null;
    if (work.file_path) buffer = await downloadFile(supabase, work.file_path);

    if (buffer && mediaType) {
      return {
        evidenceKind: "image",
        truncated: false,
        blocks: [
          {
            type: "text",
            text:
              `Declared metadata for the work being validated:\n${meta}\n\n` +
              `The delivered image follows. Assess whether it is a genuine, coherent ` +
              `piece of visual work consistent with the metadata above — not a blank, ` +
              `corrupt, placeholder, or obviously low-effort file.`,
          },
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") },
          },
        ],
      };
    }
    // No bytes to look at → fall through to metadata-only.
  }

  // ----- writing: extracted text -----
  if (work.work_type === "writing" || ext === "pdf" || ext === "docx" || TEXT_EXTS.includes(ext)) {
    if (work.file_path) {
      const buffer = await downloadFile(supabase, work.file_path);
      if (buffer) {
        let text = "";
        try {
          text = await extractText(buffer, ext);
        } catch {
          text = "";
        }
        const truncated = text.length > TEXT_CHAR_BUDGET;
        const body = truncated ? text.slice(0, TEXT_CHAR_BUDGET) : text;
        if (body.trim().length > 0) {
          return {
            evidenceKind: "text",
            truncated,
            blocks: [
              {
                type: "text",
                text:
                  `Declared metadata for the work being validated:\n${meta}\n\n` +
                  `The delivered text follows${truncated ? " (truncated)" : ""}. Assess whether ` +
                  `it is genuine, complete, and consistent with the metadata — not placeholder ` +
                  `text, lorem ipsum, an empty file, or obviously low-effort/garbled output.\n\n` +
                  `--- BEGIN DELIVERED WORK ---\n${body}\n--- END DELIVERED WORK ---`,
              },
            ],
          };
        }
      }
    }
    // No readable text → fall through to metadata-only.
  }

  // ----- music / audio (and any fallback): metadata only -----
  const fileFacts = work.file_path
    ? `A file is attached (${ext || "unknown type"}).`
    : `No file is attached.`;
  return {
    evidenceKind: "metadata",
    truncated: false,
    blocks: [
      {
        type: "text",
        text:
          `You are validating a "${work.work_type}" work but CANNOT inspect its ` +
          `media content directly (audio cannot be listened to; this file's content ` +
          `could not be read). Judge INTEGRITY and METADATA COHERENCE only, and keep ` +
          `confidence modest accordingly.\n\n` +
          `Declared metadata:\n${meta}\n\n${fileFacts}\n\n` +
          `PASS if the submission plausibly delivers what was advertised (a non-trivial ` +
          `file exists, duration/type are plausible, metadata is internally coherent). ` +
          `FAIL if it is clearly empty, missing, or internally contradictory.`,
      },
    ],
  };
}
