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

import { createHash } from "crypto";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Originality detection: an exact SHA-256 fast path plus a Chromaprint acoustic
 * fingerprint that survives re-encoding/trimming, compared against the catalog
 * to catch a stem that was downloaded and re-uploaded without remixing.
 *
 * The acoustic fingerprint needs the `fpcalc` binary (Chromaprint + ffmpeg) on
 * the server. If it isn't installed we FAIL OPEN — the upload still succeeds, we
 * log a warning, and only the exact-hash check runs — mirroring the fail-open
 * stance of the AI validation gate. SHA-256 needs no native dependency.
 */

/** Master switch; default on. Set ORIGINALITY_ENABLED="false" to disable entirely. */
function enabled(): boolean {
  return process.env.ORIGINALITY_ENABLED !== "false";
}

/** Similarity (1 - bit-error-rate) at/above which two recordings are "the same". */
function strongThreshold(): number {
  const v = Number(process.env.ORIGINALITY_STRONG_SIMILARITY);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.9;
}

/** Min fraction of the shorter fingerprint that must overlap to trust a match. */
function minOverlapFraction(): number {
  const v = Number(process.env.ORIGINALITY_MIN_OVERLAP);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
}

/** Chromaprint frames are ~0.124s; cap alignment search to bound the cost. */
const MAX_ALIGN_OFFSET = 100;

export interface AudioFingerprint {
  duration: number; // seconds (fpcalc-measured, integer-ish)
  fingerprint: number[]; // raw 32-bit ints
}

export interface MatchResult {
  workId: string;
  title: string;
  ownerProfileId: string;
  score: number;
}

const POPCOUNT = (() => {
  // Per-byte popcount table for fast 32-bit Hamming weight.
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return (x: number) =>
    t[x & 0xff] + t[(x >>> 8) & 0xff] + t[(x >>> 16) & 0xff] + t[(x >>> 24) & 0xff];
})();

export const createFingerprintService = (supabase: SupabaseClient) => ({
  enabled,

  /** Exact content hash — needs no native dependency. */
  sha256(buffer: Buffer | Uint8Array): string {
    return createHash("sha256").update(buffer).digest("hex");
  },

  /**
   * Compute a Chromaprint fingerprint via `fpcalc`. Returns null (and logs a
   * warning) if fpcalc is missing or errors — the caller then relies on the
   * exact-hash path only.
   */
  async fingerprint(
    buffer: Buffer | Uint8Array,
    ext: string
  ): Promise<AudioFingerprint | null> {
    const tmp = join(
      tmpdir(),
      `stem-fp-${randomBytes(8).toString("hex")}.${ext || "audio"}`
    );
    try {
      await writeFile(tmp, buffer);
      const out = await run("fpcalc", ["-raw", "-json", tmp]);
      const parsed = JSON.parse(out);
      const fp = Array.isArray(parsed.fingerprint) ? parsed.fingerprint : null;
      const duration = Number(parsed.duration);
      if (!fp || !fp.length || !Number.isFinite(duration)) return null;
      return { duration, fingerprint: fp };
    } catch (err: any) {
      console.warn(
        `[originality] fingerprint unavailable (fail-open): ${err?.message ?? err}`
      );
      return null;
    } finally {
      await unlink(tmp).catch(() => {});
    }
  },

  /**
   * Find the strongest catalog match for a fingerprint. Prefilters to music
   * works whose duration is within ±5% (bounds the O(N) scan), then compares
   * raw fingerprints with offset-aligned bit-error-rate. Returns the best match
   * at/above the strong-similarity threshold, or null.
   */
  async findStrongMatch(
    fp: number[],
    durationSec: number,
    excludeWorkId: string
  ): Promise<MatchResult | null> {
    const lo = Math.floor(durationSec * 0.95);
    const hi = Math.ceil(durationSec * 1.05);
    const { data: candidates } = await supabase
      .from("works")
      .select("id, title, owner_profile_id, audio_fingerprint, fingerprint_duration")
      .eq("work_type", "music")
      .in("status", ["ACTIVE", "PENDING_ATTRIBUTION"])
      .not("audio_fingerprint", "is", null)
      .neq("id", excludeWorkId)
      .gte("fingerprint_duration", lo)
      .lte("fingerprint_duration", hi);

    const threshold = strongThreshold();
    let best: MatchResult | null = null;
    for (const c of candidates ?? []) {
      const other = c.audio_fingerprint as number[] | null;
      if (!Array.isArray(other) || !other.length) continue;
      const { score, ok } = compareFingerprints(fp, other);
      if (ok && score >= threshold && (!best || score > best.score)) {
        best = {
          workId: c.id,
          title: c.title,
          ownerProfileId: c.owner_profile_id,
          score,
        };
      }
    }
    return best;
  },
});

/** Spawn a binary and resolve its stdout; reject on spawn error / non-zero exit. */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject); // ENOENT when fpcalc isn't installed
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Compare two raw Chromaprint fingerprints. Slides one over the other within a
 * bounded offset window, and for the best alignment computes the bit-error-rate
 * over the overlapping frames; similarity = 1 - BER. `ok` is false when the
 * overlap is too small to trust (e.g. a brief shared sample).
 *
 * Exported for unit testing against identical / re-encoded / trimmed / unrelated
 * pairs (see the verification notes in the plan).
 */
export function compareFingerprints(
  a: number[],
  b: number[]
): { score: number; ok: boolean } {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return { score: 0, ok: false };
  const minOverlap = Math.max(1, Math.floor(minLen * minOverlapFraction()));

  let bestScore = 0;
  let bestOverlap = 0;
  for (let offset = -MAX_ALIGN_OFFSET; offset <= MAX_ALIGN_OFFSET; offset++) {
    // Align a[i] with b[i+offset]; compute the overlapping index range in a.
    const start = Math.max(0, -offset);
    const end = Math.min(a.length, b.length - offset);
    const overlap = end - start;
    if (overlap < minOverlap) continue;

    let bitErrors = 0;
    for (let i = start; i < end; i++) bitErrors += POPCOUNT(a[i] ^ b[i + offset]);
    const score = 1 - bitErrors / (overlap * 32);
    if (score > bestScore) {
      bestScore = score;
      bestOverlap = overlap;
    }
  }
  return { score: bestScore, ok: bestOverlap >= minOverlap };
}
