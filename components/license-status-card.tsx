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

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RoyaltyBreakdown, BreakdownRow } from "@/components/royalty-breakdown";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { KawaiiWallet } from "@/components/kawaii/kawaii-wallet";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { formatUsdc } from "@/lib/utils/royalty";
import { LicenseStatus, LicenseWithDetails } from "@/types/royalty";

const STEPS: { label: string; reached: LicenseStatus[] }[] = [
  { label: "Created", reached: ["JOB_CREATED", "BUDGETED", "APPROVED", "FUNDED", "SUBMITTED", "COMPLETED", "SPLITTING", "CLOSED"] },
  { label: "Funded", reached: ["FUNDED", "SUBMITTED", "COMPLETED", "SPLITTING", "CLOSED"] },
  { label: "Validated", reached: ["COMPLETED", "SPLITTING", "CLOSED"] },
  { label: "Royalties paid", reached: ["CLOSED"] },
];

const STATUS_LABEL: Record<string, string> = {
  INITIATED: "initiated",
  JOB_CREATED: "job created",
  BUDGETED: "ready to fund",
  APPROVED: "approved",
  FUNDED: "in escrow — release pending",
  SUBMITTED: "in escrow — release pending",
  COMPLETED: "validated",
  SPLITTING: "paying out royalties…",
  CLOSED: "licensed — royalties paid ✨",
  REFUNDED: "refunded",
  FAILED: "oopsie — failed",
};

const STATUS_STYLE: Record<string, string> = {
  CLOSED: "bg-[#D6F5E3] text-[#3E9E68]",
  SPLITTING: "bg-secondary text-secondary-foreground",
  FUNDED: "bg-[#DCEBFB] text-[#5C8FCF]",
  SUBMITTED: "bg-[#DCEBFB] text-[#5C8FCF]",
  COMPLETED: "bg-[#DCEBFB] text-[#5C8FCF]",
  FAILED: "bg-[#FBE0EA] text-[#C75B86]",
  REFUNDED: "bg-[#FBE0EA] text-[#C75B86]",
};

function statusPill(status: string) {
  return STATUS_STYLE[status] ?? "bg-muted text-muted-foreground";
}

interface Props {
  initialLicense: LicenseWithDetails;
  isBuyer: boolean;
  isOwner: boolean;
}

export function LicenseStatusCard({ initialLicense, isBuyer, isOwner }: Props) {
  const [license, setLicense] = useState<LicenseWithDetails>(initialLicense);
  const [busy, setBusy] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/licenses/${initialLicense.id}`);
    if (res.ok) {
      const json = await res.json();
      setLicense(json.license);
    }
  }, [initialLicense.id]);

  // Live updates while the license is in flight.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`license-${initialLicense.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "licenses", filter: `id=eq.${initialLicense.id}` },
        () => refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "royalty_payments", filter: `license_id=eq.${initialLicense.id}` },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialLicense.id, refetch]);

  // Fallback polling while royalties settle.
  useEffect(() => {
    if (license.status !== "SPLITTING") return;
    const t = setInterval(refetch, 4000);
    return () => clearInterval(t);
  }, [license.status, refetch]);

  async function act(path: string, label: string) {
    setBusy(label);
    try {
      const res = await fetch(`/api/licenses/${initialLicense.id}/${path}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.reasons ? `${json.error}: ${json.reasons.join("; ")}` : json.error
        );
      }
      toast.success(`${label} complete`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  const currentStep = STEPS.reduce(
    (acc, s, i) => (s.reached.includes(license.status) ? i + 1 : acc),
    0
  );

  const canFund =
    isBuyer && ["JOB_CREATED", "BUDGETED", "APPROVED"].includes(license.status);
  const canRelease =
    (isBuyer || isOwner) && ["FUNDED", "SUBMITTED"].includes(license.status);

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
        <CardTitle className="text-lg">escrow &amp; royalties ☁️</CardTitle>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${statusPill(
            license.status
          )}`}
        >
          {STATUS_LABEL[license.status] ?? license.status}
        </span>
      </CardHeader>
      <CardContent className="relative space-y-6">
        {/* Cloud stepper */}
        <div className="flex items-start justify-between">
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold transition-all duration-300 ${
                    done
                      ? "bg-gradient-to-br from-[#A7CDF5] to-[#C9A9F5] text-white shadow-cloud-sm"
                      : active
                        ? "border-2 border-[var(--blue-deep)] bg-card text-[var(--blue-deep)] animate-twinkle"
                        : "border-2 border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-5 w-5" /> : i + 1}
                </div>
                <span
                  className={`text-center text-[11px] font-bold ${
                    done || active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Amount cloud */}
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <KawaiiWallet size={32} /> license amount
          </span>
          <span className="text-2xl font-extrabold text-[var(--blue-deep)]">
            {formatUsdc(license.amount_usdc)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {canFund && (
            <Button onClick={() => act("fund", "Fund")} disabled={!!busy} size="lg">
              {busy === "Fund" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  approving &amp; funding escrow…
                </>
              ) : (
                `Fund escrow (${formatUsdc(license.amount_usdc)}) ✿`
              )}
            </Button>
          )}
          {canRelease && (
            <>
              <p className="rounded-2xl bg-secondary/40 p-3 text-xs font-semibold text-secondary-foreground">
                💛 the license is active — the work is already yours. the{" "}
                {formatUsdc(license.amount_usdc)} is tucked safely in escrow; releasing
                it runs Claude validation and floats the USDC out to every contributor
                (human &amp; AI) by their split.
              </p>
              <Button onClick={() => act("release", "Release")} disabled={!!busy} size="lg">
                {busy === "Release" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    validating &amp; releasing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Validate &amp; release royalties
                  </>
                )}
              </Button>
            </>
          )}
          {license.status === "SPLITTING" && (
            <div className="flex flex-col items-center gap-1 py-2">
              <div className="animate-bounce-soft">
                <StemCloud size={64} notes={false} />
              </div>
              <p className="text-sm font-bold text-muted-foreground">
                floating USDC out to every contributor…
              </p>
            </div>
          )}
          {license.status === "CLOSED" && (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#D6F5E3] p-3 text-sm font-extrabold text-[#3E9E68]">
              <StemCloud size={40} notes={false} />
              all royalties paid out on Arc! 🎉
            </div>
          )}
        </div>

        {breakdownRows.length > 0 && <RoyaltyBreakdown rows={breakdownRows} />}
      </CardContent>
    </Card>
  );
}
