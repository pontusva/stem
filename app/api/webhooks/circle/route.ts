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

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { getBaseUrl } from "@/lib/utils/base-url";

const baseUrl = getBaseUrl();

/**
 * Advance royalty payouts as their Circle transfers settle. When every payout
 * for a license has completed, the license is closed.
 */
async function handleRoyaltyTransfer(
  transactionId: string,
  state: string
): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const { data: payment } = await supabase
    .from("royalty_payments")
    .select("id, license_id, status")
    .eq("circle_transfer_id", transactionId)
    .single();

  if (!payment) return; // not a royalty transfer

  const nextStatus =
    state === "COMPLETE" ? "COMPLETE" : state === "FAILED" ? "FAILED" : null;
  if (!nextStatus || payment.status === nextStatus) return;

  await supabase
    .from("royalty_payments")
    .update({ status: nextStatus })
    .eq("id", payment.id);

  // Close the license once all of its payouts have settled.
  const { data: remaining } = await supabase
    .from("royalty_payments")
    .select("status")
    .eq("license_id", payment.license_id);

  const allComplete =
    (remaining ?? []).length > 0 &&
    (remaining ?? []).every((p: any) => p.status === "COMPLETE");

  if (allComplete) {
    await supabase
      .from("licenses")
      .update({ status: "CLOSED" })
      .eq("id", payment.license_id);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServiceClient();
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json(
        { error: "Missing signature or keyId in headers" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const bodyString = JSON.stringify(body);

    const isVerified = await verifyCircleSignature(bodyString, signature, keyId);
    if (!isVerified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const {
      id: transactionId,
      walletId,
      state: transactionState,
    } = body.notification;

    // Refresh cached wallet balance when any transaction completes.
    if (walletId && transactionState === "COMPLETE") {
      try {
        const response = await fetch(`${baseUrl}/api/wallet/balance`, {
          method: "POST",
          body: JSON.stringify({ walletId }),
          headers: { "Content-Type": "application/json" },
        });
        const parsed = await response.json();
        await supabase
          .from("wallets")
          .update({ balance: parsed.balance })
          .eq("circle_wallet_id", walletId);
      } catch (balanceError) {
        console.error("Failed to refresh wallet balance:", balanceError);
      }
    }

    // Advance royalty payouts.
    if (transactionId) {
      await handleRoyaltyTransfer(transactionId, transactionState);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log("Failed to process notification:", message);
    return NextResponse.json(
      { error: `Failed to process notification: ${message}` },
      { status: 500 }
    );
  }
}

// Handle HEAD requests to verify endpoint availability.
export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}

async function verifyCircleSignature(
  bodyString: string,
  signature: string,
  keyId: string
): Promise<boolean> {
  const publicKey = await getCirclePublicKey(keyId);

  const verifier = crypto.createVerify("SHA256");
  verifier.update(bodyString);
  verifier.end();

  const signatureUint8Array = Uint8Array.from(Buffer.from(signature, "base64"));
  return verifier.verify(publicKey, signatureUint8Array);
}

async function getCirclePublicKey(keyId: string) {
  if (!process.env.CIRCLE_API_KEY) {
    throw new Error("Circle API key is not set");
  }

  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch public key: ${response.statusText}`);
  }

  const data = await response.json();
  const rawPublicKey = data.data.publicKey;
  return `-----BEGIN PUBLIC KEY-----\n${rawPublicKey
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END PUBLIC KEY-----`;
}
