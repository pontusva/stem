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
import { anthropic, VALIDATION_MODEL } from "@/lib/utils/anthropicClient";
import { gatherWorkEvidence } from "@/lib/utils/work-evidence";
import type { ValidationResult, Work } from "@/types/royalty";

/** Thrown when validation can't complete and the gate is configured fail-closed. */
export class ValidationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationUnavailableError";
  }
}

/** Default to fail-open: an Anthropic outage shouldn't halt every sale. */
function failOpenEnabled(): boolean {
  return process.env.VALIDATION_FAIL_OPEN !== "false";
}

const SYSTEM_PROMPT =
  "You are the STEM Validator, a paid AI reviewer in a royalty protocol. For each " +
  "delivered creative work you decide whether a buyer would reasonably receive what " +
  "was advertised: is it genuine, complete, and consistent with its declared metadata " +
  "— not a blank, corrupt, placeholder, lorem-ipsum, or obviously low-effort/garbled " +
  "submission? Return PASS only if it clears that bar. You are paid for honest review, " +
  "not for approving everything. When you cannot inspect the media directly (e.g. audio), " +
  "judge integrity and metadata coherence only and lower your confidence accordingly.";

const REPORT_TOOL = {
  name: "report_validation",
  description: "Report the validation verdict for the delivered work.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: { type: "string", enum: ["PASS", "FAIL"], description: "Final verdict." },
      confidence: {
        type: "number",
        description: "Confidence in the verdict, 0 (none) to 1 (certain).",
      },
      reasoning: {
        type: "string",
        description: "One or two sentences explaining the verdict for the buyer and creator.",
      },
    },
    required: ["verdict", "confidence", "reasoning"],
  },
};

type WorkForValidation = Pick<
  Work,
  "title" | "description" | "work_type" | "file_path" | "file_url" | "duration_seconds"
>;

function clampConfidence(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export const createValidationService = (supabase: SupabaseClient) => ({
  /**
   * Review a delivered work with Claude. Returns the verdict + the model used.
   * On a Claude error/refusal: fail-open (low-confidence PASS, failedOpen=true)
   * unless VALIDATION_FAIL_OPEN="false", in which case it throws.
   */
  async validateWork(
    work: WorkForValidation
  ): Promise<ValidationResult & { model: string }> {
    const evidence = await gatherWorkEvidence(supabase, work);

    try {
      const response = await anthropic.messages.create({
        model: VALIDATION_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "report_validation" },
        messages: [{ role: "user", content: evidence.blocks as any }],
      });

      const toolUse = response.content.find(
        (b: any) => b.type === "tool_use" && b.name === "report_validation"
      ) as any;

      if (!toolUse?.input) {
        throw new Error("validator returned no structured verdict");
      }

      const input = toolUse.input as {
        verdict?: string;
        confidence?: number;
        reasoning?: string;
      };
      const verdict = input.verdict === "FAIL" ? "FAIL" : "PASS";

      return {
        verdict,
        confidence: clampConfidence(input.confidence),
        reasoning: (input.reasoning ?? "").trim() || "No reasoning provided.",
        evidenceKind: evidence.evidenceKind,
        failedOpen: false,
        model: VALIDATION_MODEL,
      };
    } catch (err: any) {
      if (!failOpenEnabled()) {
        throw new ValidationUnavailableError(
          `Work validation is required but unavailable: ${err?.message ?? "Claude error"}`
        );
      }
      // Fail-open: record a low-confidence PASS; the caller charges no fee.
      return {
        verdict: "PASS",
        confidence: 0,
        reasoning:
          "Automated validation was unavailable; the sale proceeded without a review " +
          "(no validation fee charged).",
        evidenceKind: evidence.evidenceKind,
        failedOpen: true,
        model: VALIDATION_MODEL,
      };
    }
  },
});
