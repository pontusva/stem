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

import Link from "next/link";
import { ExternalLink, ShieldCheck, ShieldX } from "lucide-react";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createValidatorAgentService } from "@/app/services/validator-agent.service";
import { Card, CardContent } from "@/components/ui/card";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { EmptyState } from "@/components/kawaii/empty-state";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { WalletBalance } from "@/components/wallet-balance";
import { formatUsdc } from "@/lib/utils/royalty";

export const dynamic = "force-dynamic";

const EXPLORER = "https://testnet.arcscan.app";

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

/**
 * Public transparency ledger for the STEM Validator — the platform AI that
 * reviews every delivered work before payout and earns a USDC fee for that
 * work. Anyone (signed in or not) can see what it has reviewed, what each
 * buyer paid it, and its live on-chain balance. Read via the service-role
 * client because the validator wallet is owner-less (RLS would hide its rows).
 */
export default async function ValidatorPage() {
  const service = createSupabaseServiceClient();
  const { validator, stats, recent } = await createValidatorAgentService(
    service
  ).getValidatorOverview();

  const passRate =
    stats.reviewed > 0 ? Math.round((stats.passed / stats.reviewed) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6] p-8">
        <SparkleDecoration count={8} />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="rounded-3xl border-[3px] border-card bg-card shadow-cloud-sm">
              <KawaiiAI size={84} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-3xl font-extrabold">{validator.display_name} 🤖</h1>
              <p className="max-w-md font-semibold text-muted-foreground">
                An AI that reviews every delivered work before payout — and earns a
                small USDC fee for the work it does. Every review below is paid for by
                a buyer; the fees accrue on-chain in its own wallet.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold">
                <span className="rounded-full bg-card/70 px-2.5 py-0.5 text-muted-foreground">
                  model · claude-opus-4-8
                </span>
                {validator.erc8004_agent_id && (
                  <a
                    href={`${EXPLORER}/address/${validator.wallet_address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground hover:brightness-95"
                  >
                    ✨ ERC-8004 #{validator.erc8004_agent_id}
                  </a>
                )}
                {validator.wallet_address && (
                  <a
                    href={`${EXPLORER}/address/${validator.wallet_address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full bg-card/70 px-2.5 py-0.5 font-mono text-muted-foreground hover:text-foreground"
                  >
                    {short(validator.wallet_address)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-extrabold text-[var(--blue-deep)]">
              <WalletBalance walletId={validator.circle_wallet_id} />
            </div>
            <div className="text-xs font-bold text-muted-foreground">
              live wallet balance (USDC)
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          what it has earned for its work
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="fees earned" value={formatUsdc(stats.feesEarned, 4)} big />
          <StatCard label="works reviewed" value={String(stats.reviewed)} />
          <StatCard label="✓ passed" value={String(stats.passed)} />
          <StatCard label="✗ rejected" value={String(stats.rejected)} />
        </div>
        {stats.reviewed > 0 && (
          <p className="text-center text-xs font-bold text-muted-foreground">
            {passRate}% pass rate · the validator is paid only when it approves a work
          </p>
        )}
      </section>

      {/* Activity feed */}
      {recent.length === 0 ? (
        <EmptyState
          title="no validations yet…"
          hint="License a work and the STEM Validator will get to work — each review it does shows up here, with the fee it earned and a link to the on-chain payment."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">validation feed</h2>
          <div className="space-y-2">
            {recent.map((v) => {
              const passed = v.verdict === "PASS";
              return (
                <Card key={v.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                        {passed ? (
                          <ShieldCheck className="h-4 w-4 text-[#3E9E68]" />
                        ) : (
                          <ShieldX className="h-4 w-4 text-[#C75B86]" />
                        )}
                      </div>
                      <div className="leading-tight">
                        <span className="block text-sm font-extrabold">
                          {v.work?.id ? (
                            <Link
                              href={`/works/${v.work.id}`}
                              className="text-[var(--blue-deep)] hover:underline"
                            >
                              {v.work.title}
                            </Link>
                          ) : (
                            "a work"
                          )}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">
                          reviewed {v.work?.work_type ?? ""}
                          {v.confidence != null &&
                            ` · ${Math.round(Number(v.confidence) * 100)}% confidence`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.fee_usdc > 0 && (
                        <span className="font-extrabold text-[var(--blue-deep)]">
                          {formatUsdc(v.fee_usdc, 4)}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                          passed
                            ? "bg-[#D6F5E3] text-[#3E9E68]"
                            : "bg-[#FBE0EA] text-[#C75B86]"
                        }`}
                      >
                        {passed ? "passed ✓" : "rejected"}
                      </span>
                      {v.onchain_tx_hash && (
                        <a
                          href={`${EXPLORER}/tx/${v.onchain_tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          title="view fee payment on arcscan"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-5 text-center">
        <div
          className={`font-extrabold text-[var(--blue-deep)] ${
            big ? "text-3xl" : "text-2xl"
          }`}
        >
          {value}
        </div>
        <div className="text-xs font-bold text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
