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
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { ARC, waitForCircleTx } from "@/lib/utils/arc";
import { computeSplitAmounts } from "@/lib/utils/royalty";
import { License, LicenseStatus, LicenseWithDetails } from "@/types/royalty";

const LICENSE_DETAIL_SELECT = `
  *,
  work:works!licenses_work_id_fkey ( * ),
  royalty_payments:royalty_payments!royalty_payments_license_id_fkey (
    *,
    contributor:contributors!royalty_payments_contributor_id_fkey ( display_name, contributor_type )
  )
`;

export const createLicenseService = (supabase: SupabaseClient) => ({
  async createLicense(params: {
    workId: string;
    buyerProfileId: string;
    buyerWalletId: string;
    amountUsdc: number;
  }): Promise<License> {
    const { data, error } = await supabase
      .from("licenses")
      .insert({
        work_id: params.workId,
        buyer_profile_id: params.buyerProfileId,
        buyer_wallet_id: params.buyerWalletId,
        amount_usdc: params.amountUsdc,
        status: "INITIATED",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create license: ${error.message}`);
    return data as License;
  },

  async updateStatus(
    licenseId: string,
    status: LicenseStatus,
    extra: Partial<Pick<License, "onchain_job_id" | "job_tx_hash">> = {}
  ): Promise<void> {
    const { error } = await supabase
      .from("licenses")
      .update({ status, ...extra })
      .eq("id", licenseId);
    if (error) throw new Error(`Failed to update license: ${error.message}`);
  },

  async getLicense(licenseId: string): Promise<License | null> {
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("id", licenseId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch license: ${error.message}`);
    }
    return data as License;
  },

  /**
   * Reconcile PENDING royalty payouts by polling Circle for each transfer's
   * state, then close the license once all payouts have settled. This replaces
   * the webhook on local dev (Circle can't reach localhost) and is a safe
   * idempotent backstop in production.
   */
  async reconcilePendingPayments(licenseId: string): Promise<void> {
    const { data: pending } = await supabase
      .from("royalty_payments")
      .select("id, circle_transfer_id, status")
      .eq("license_id", licenseId)
      .eq("status", "PENDING");

    for (const p of pending ?? []) {
      if (!p.circle_transfer_id) continue;
      try {
        const { data } = await circleDeveloperSdk.getTransaction({
          id: p.circle_transfer_id,
        });
        const state = data?.transaction?.state;
        if (state === "COMPLETE") {
          await supabase
            .from("royalty_payments")
            .update({ status: "COMPLETE" })
            .eq("id", p.id);
        } else if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
          await supabase
            .from("royalty_payments")
            .update({ status: "FAILED" })
            .eq("id", p.id);
        }
      } catch {
        // transient — leave PENDING, will retry on next poll
      }
    }

    // Close the license once every payout is COMPLETE.
    const { data: all } = await supabase
      .from("royalty_payments")
      .select("status")
      .eq("license_id", licenseId);
    if ((all ?? []).length > 0 && (all ?? []).every((r: any) => r.status === "COMPLETE")) {
      await supabase
        .from("licenses")
        .update({ status: "CLOSED" })
        .eq("id", licenseId)
        .eq("status", "SPLITTING");
    }
  },

  async getLicenseWithDetails(
    licenseId: string
  ): Promise<LicenseWithDetails | null> {
    const { data, error } = await supabase
      .from("licenses")
      .select(LICENSE_DETAIL_SELECT)
      .eq("id", licenseId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch license: ${error.message}`);
    }
    return data as unknown as LicenseWithDetails;
  },

  /**
   * Instant derivative-license purchase — no escrow. The buyer's own Circle
   * wallet pays each contributor their split directly (one wallet-to-wallet USDC
   * transfer per contributor, proportional to split_pct), then the license is
   * granted (CLOSED). A COMPLETE royalty_payment is recorded per contributor so
   * earnings reflect it immediately. If any leg fails the license is marked
   * FAILED and the error is rethrown (note: earlier legs may already be paid).
   */
  async purchaseInstant(params: {
    workId: string;
    buyerProfileId: string;
    buyerWalletId: string;
    buyerCircleWalletId: string;
    amountUsdc: number;
  }): Promise<{
    license: License;
    payments: { contributorId: string; amount: number; transferId?: string }[];
  }> {
    const { data: contributors, error: contribError } = await supabase
      .from("contributors")
      .select(
        `*, wallet:wallets!contributors_wallet_id_fkey ( id, wallet_address )`
      )
      .eq("work_id", params.workId)
      .order("split_pct", { ascending: false });

    if (contribError) {
      throw new Error(`Failed to fetch contributors: ${contribError.message}`);
    }
    if (!contributors?.length) {
      throw new Error("Work has no contributors to pay");
    }

    const amounts = computeSplitAmounts(params.amountUsdc, contributors as any[]);

    const license = await this.createLicense({
      workId: params.workId,
      buyerProfileId: params.buyerProfileId,
      buyerWalletId: params.buyerWalletId,
      amountUsdc: params.amountUsdc,
    });

    const results: {
      contributorId: string;
      amount: number;
      transferId?: string;
    }[] = [];

    try {
      for (let i = 0; i < contributors.length; i++) {
        const contributor = contributors[i] as any;
        const amount = amounts[i];
        const destinationAddress = contributor.wallet?.wallet_address;

        if (!destinationAddress || amount <= 0) {
          results.push({ contributorId: contributor.id, amount });
          continue;
        }

        const transfer = await circleDeveloperSdk.createTransaction({
          walletId: params.buyerCircleWalletId,
          destinationAddress,
          amount: [amount.toFixed(6)],
          tokenAddress: ARC.USDC,
          blockchain: ARC.BLOCKCHAIN as any,
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });

        const transferId = transfer.data?.id;
        if (transferId) {
          await waitForCircleTx(transferId, `pay ${contributor.display_name}`);
        }

        await supabase.from("royalty_payments").insert({
          license_id: license.id,
          contributor_id: contributor.id,
          wallet_id: contributor.wallet_id,
          amount_usdc: amount,
          split_pct: contributor.split_pct,
          circle_transfer_id: transferId,
          status: "COMPLETE",
        });

        results.push({ contributorId: contributor.id, amount, transferId });
      }
    } catch (err) {
      await this.updateStatus(license.id, "FAILED");
      throw err;
    }

    await this.updateStatus(license.id, "CLOSED");
    return { license: { ...license, status: "CLOSED" }, payments: results };
  },
});
