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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine, Loader2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/utils/royalty";

interface LedgerEntry {
  id: string;
  entry_type: string;
  amount_usdc: number | string;
  status: string;
  created_at: string;
}

const ENTRY_META: Record<string, { label: string; positive: boolean }> = {
  TOPUP: { label: "topped up", positive: true },
  STREAM_CREDIT: { label: "streaming earnings", positive: true },
  STREAM_DEBIT: { label: "streaming play", positive: false },
  WITHDRAWAL: { label: "withdrawn", positive: false },
};

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Streaming "pocket" surface for the earnings page — the creator's side, where
 * pay-per-listen income is RECEIVED. Shows the withdrawable balance, a withdraw
 * action, and a recent activity log. (Top-up lives on the listener side, in the
 * work-detail player, since that's where money is put IN to stream.)
 */
export function PocketCard({
  balance,
  streamingEarned,
}: {
  balance: number;
  streamingEarned: number;
}) {
  const router = useRouter();
  const [withdrawing, setWithdrawing] = useState(false);
  const [activity, setActivity] = useState<LedgerEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/pocket");
      if (!res.ok) return;
      const json = await res.json();
      setActivity(Array.isArray(json.ledger) ? json.ledger.slice(0, 6) : []);
    } catch {
      // ignore — activity is best-effort
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function withdraw() {
    setWithdrawing(true);
    try {
      const res = await fetch("/api/pocket/withdraw", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Withdrawal failed");
      toast.success(`Withdrew ${formatUsdc(json.amount, 6)} to your wallet`);
      await reload();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
              <Wallet className="h-5 w-5 text-[var(--blue-deep)]" />
            </div>
            <div className="leading-tight">
              <div className="text-2xl font-extrabold text-[var(--blue-deep)]">
                {formatUsdc(balance, 4)}
              </div>
              <div className="text-xs font-bold text-muted-foreground">
                🎧 available to withdraw · {formatUsdc(streamingEarned, 4)} earned all-time
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={withdraw} disabled={withdrawing || balance <= 0} size="sm">
              {withdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> withdrawing…
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4" /> withdraw
                </>
              )}
            </Button>
          </div>
        </div>

        {activity.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              recent activity <span className="font-bold normal-case text-muted-foreground/70">· a history, not a balance</span>
            </p>
            {activity.map((e) => {
              const meta =
                ENTRY_META[e.entry_type] ?? { label: e.entry_type.toLowerCase(), positive: true };
              const amount = Math.abs(Number(e.amount_usdc));
              return (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold text-muted-foreground">
                    {meta.label}
                    {e.status !== "COMPLETE" && (
                      <span className="ml-1 text-[10px] font-extrabold lowercase text-[var(--lavender-deep)]">
                        · {e.status.toLowerCase()}
                      </span>
                    )}
                    <span className="ml-1.5 font-semibold text-muted-foreground/60">
                      {fmtWhen(e.created_at)}
                    </span>
                  </span>
                  <span
                    className={`font-bold ${
                      meta.positive ? "text-[#3E9E68]" : "text-[var(--blue-deep)]"
                    }`}
                  >
                    {meta.positive ? "+" : "−"}
                    {formatUsdc(amount, 6)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
