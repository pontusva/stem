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

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoyaltyBreakdown, BreakdownRow } from "@/components/royalty-breakdown";
import { KawaiiWallet } from "@/components/kawaii/kawaii-wallet";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { formatUsdc } from "@/lib/utils/royalty";
import { LicenseWithDetails } from "@/types/royalty";

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "licensed — paid out ✨",
  FAILED: "payment failed",
  REFUNDED: "refunded",
};

const STATUS_STYLE: Record<string, string> = {
  CLOSED: "bg-[#D6F5E3] text-[#3E9E68]",
  FAILED: "bg-[#FBE0EA] text-[#C75B86]",
  REFUNDED: "bg-[#FBE0EA] text-[#C75B86]",
};

interface Props {
  initialLicense: LicenseWithDetails;
  isBuyer?: boolean;
  isOwner?: boolean;
}

/**
 * License receipt. Derivative licenses are bought with an instant direct split
 * payment, so by the time this renders the license is already granted (CLOSED)
 * and every contributor has been paid — this just shows the record.
 */
export function LicenseStatusCard({ initialLicense }: Props) {
  const license = initialLicense;
  const payments = license.royalty_payments ?? [];
  const breakdownRows: BreakdownRow[] = payments.map((p) => ({
    name: p.contributor?.display_name ?? "Contributor",
    type: p.contributor?.contributor_type ?? "human",
    splitPct: Number(p.split_pct),
    amount: Number(p.amount_usdc),
    status: p.status,
  }));

  return (
    <Card className="relative overflow-hidden">
      <SparkleDecoration count={5} />
      <CardHeader className="relative flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">license receipt ☁️</CardTitle>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            STATUS_STYLE[license.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {STATUS_LABEL[license.status] ?? license.status}
        </span>
      </CardHeader>
      <CardContent className="relative space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <KawaiiWallet size={32} /> license price
          </span>
          <span className="text-2xl font-extrabold text-[var(--blue-deep)]">
            {formatUsdc(license.amount_usdc)}
          </span>
        </div>

        {license.status === "CLOSED" && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#D6F5E3] p-3 text-sm font-extrabold text-[#3E9E68]">
            <StemCloud size={40} notes={false} />
            paid instantly to every contributor on Arc! 🎉
          </div>
        )}
        {license.status === "FAILED" && (
          <p className="rounded-2xl bg-[#FBE0EA] p-3 text-sm font-bold text-[#C75B86]">
            this purchase didn&apos;t go through — no license was granted.
          </p>
        )}

        {breakdownRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-muted-foreground">
              how the {formatUsdc(license.amount_usdc)} was split:
            </p>
            <RoyaltyBreakdown rows={breakdownRows} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
