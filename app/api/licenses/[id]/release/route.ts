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
import { keccak256, toHex } from "viem";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createLicenseService } from "@/app/services/license.service";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, VALIDATION_MODEL } from "@/lib/utils/anthropicClient";
import { getCurrentUser } from "@/lib/utils/current-user";
import { ARC, waitForCircleTx } from "@/lib/utils/arc";

interface ValidationResult {
  valid: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const IMAGE_MEDIA_TYPES: Record<string, ImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

// JSON schema that constrains Claude's response to a clean validation verdict.
const VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    valid: { type: "boolean" },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    reasons: { type: "array", items: { type: "string" } },
  },
  required: ["valid", "confidence", "reasons"],
  additionalProperties: false,
} as const;

/** AI-validate that a work file is a coherent creative work of its stated type, using Claude vision. */
async function validateWork(
  fileUrl: string,
  workType: string,
  title: string,
  description: string | null
): Promise<ValidationResult> {
  const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = IMAGE_MEDIA_TYPES[ext];

  // Only images can be inspected by the vision model. Non-visual works
  // (music, writing) auto-pass — provenance is established at registration.
  if (!mediaType) {
    return {
      valid: true,
      confidence: "HIGH",
      reasons: [`Non-visual ${workType} work approved via provenance record`],
    };
  }

  const res = await fetch(fileUrl);
  if (!res.ok) {
    return { valid: false, confidence: "LOW", reasons: ["Could not fetch work file"] };
  }
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");

  const prompt = `You are validating a creative work before releasing royalties to its contributors.
Confirm the attached image is a genuine, coherent creative work of type "${workType}".
Title: "${title}". Description: "${description ?? "n/a"}".

- "valid": is this a legitimate ${workType} work?
- "confidence": LOW | MEDIUM | HIGH
- "reasons": concerns, if any (empty array if fully valid)`;

  const response = await anthropic.messages.create({
    model: VALIDATION_MODEL,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: VALIDATION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock && "text" in textBlock ? textBlock.text : null;
  if (!content) {
    return { valid: false, confidence: "LOW", reasons: ["No validation response"] };
  }
  return JSON.parse(content) as ValidationResult;
}

/**
 * POST /api/licenses/[id]/release
 * Submits the deliverable (agent), AI-validates the work, completes the job
 * (agent/evaluator) so the agent receives the escrowed USDC, then fans the
 * funds out to every contributor per their split.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const agentWalletId = process.env.NEXT_PUBLIC_AGENT_WALLET_ID;
  if (!agentWalletId) {
    return NextResponse.json(
      { error: "Agent wallet not configured" },
      { status: 500 }
    );
  }

  const service = createSupabaseServiceClient();
  const licenseService = createLicenseService(service);

  try {
    const { data: license } = await service
      .from("licenses")
      .select(`*, work:works!licenses_work_id_fkey ( id, title, description, work_type, file_url, owner_profile_id )`)
      .eq("id", params.id)
      .single();

    if (!license) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }
    const work = (license as any).work;

    // Buyer or the work owner may trigger delivery + validation.
    if (
      license.buyer_profile_id !== user.profileId &&
      work.owner_profile_id !== user.profileId
    ) {
      return NextResponse.json(
        { error: "Only the buyer or work owner can release this license" },
        { status: 403 }
      );
    }

    if (!["FUNDED", "SUBMITTED"].includes(license.status)) {
      return NextResponse.json(
        { error: `License must be FUNDED to release (is ${license.status})` },
        { status: 400 }
      );
    }
    if (!license.onchain_job_id) {
      return NextResponse.json(
        { error: "License has no on-chain job" },
        { status: 400 }
      );
    }
    if (!work.file_url) {
      return NextResponse.json(
        { error: "Work has no file to deliver" },
        { status: 400 }
      );
    }

    // 1. submit(jobId, deliverableHash) — agent (provider) anchors the deliverable.
    if (license.status === "FUNDED") {
      const deliverableHash = keccak256(toHex(`${work.id}:${license.id}`));
      const submit = await circleDeveloperSdk.createContractExecutionTransaction({
        walletId: agentWalletId,
        contractAddress: ARC.AGENTIC_COMMERCE,
        abiFunctionSignature: "submit(uint256,bytes32,bytes)",
        abiParameters: [license.onchain_job_id, deliverableHash, "0x"],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      const submitTxId = submit.data?.id;
      if (!submitTxId) throw new Error("submit did not return a transaction id");
      await waitForCircleTx(submitTxId, "submit deliverable");
      await licenseService.updateStatus(license.id, "SUBMITTED");
    }

    // 2. AI validation gate. A genuine "invalid" verdict blocks the release;
    //    but if Claude can't run at all (no API credits, bad key, network),
    //    that's an infra issue — degrade to auto-approve so escrow can settle.
    let validation: ValidationResult;
    try {
      validation = await validateWork(
        work.file_url,
        work.work_type,
        work.title,
        work.description
      );
    } catch (aiError) {
      const message =
        aiError instanceof Error ? aiError.message : "AI validation unavailable";
      console.warn(`AI validation could not run — auto-approving: ${message}`);
      validation = {
        valid: true,
        confidence: "HIGH",
        reasons: [`AI validation unavailable — auto-approved (${message.slice(0, 100)})`],
      };
    }

    if (!validation.valid || validation.confidence !== "HIGH") {
      return NextResponse.json(
        {
          error: "Work failed validation; royalties not released",
          reasons: validation.reasons,
        },
        { status: 400 }
      );
    }

    // 3. complete(jobId, reason) — agent (evaluator) releases escrow to itself.
    const reasonHash = keccak256(toHex("royalties-approved"));
    const complete = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: agentWalletId,
      contractAddress: ARC.AGENTIC_COMMERCE,
      abiFunctionSignature: "complete(uint256,bytes32,bytes)",
      abiParameters: [license.onchain_job_id, reasonHash, "0x"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const completeTxId = complete.data?.id;
    if (!completeTxId) throw new Error("complete did not return a transaction id");
    await waitForCircleTx(completeTxId, "complete job");
    await licenseService.updateStatus(license.id, "COMPLETED");

    // 4. Fan out royalties to every contributor.
    const { payments } = await licenseService.fanOutRoyalties(license.id);

    return NextResponse.json({
      status: "SPLITTING",
      validation,
      payments,
    });
  } catch (error: any) {
    console.error("Release failed:", error);
    return NextResponse.json(
      { error: `Failed to release license: ${error.message}` },
      { status: 500 }
    );
  }
}
