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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine, Loader2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/utils/royalty";

const TOPUP_AMOUNT = 1; // USDC per top-up tap

/**
 * Streaming "pocket" surface for the earnings page: shows the withdrawable
 * balance from pay-per-listen credits, with top-up (fund listening) and
 * withdraw (cash out to the Circle wallet) actions.
 */
export function PocketCard({
  balance,
  streamingEarned,
}: {
  balance: number;
  streamingEarned: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"topup" | "withdraw" | null>(null);

  async function topUp() {
    setBusy("topup");
    try {
      const res = await fetch("/api/pocket/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: TOPUP_AMOUNT }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Top-up failed");
      toast.success(`Topped up ${formatUsdc(TOPUP_AMOUNT)} to your pocket`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Top-up failed");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("withdraw");
    try {
      const res = await fetch("/api/pocket/withdraw", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Withdrawal failed");
      toast.success(`Withdrew ${formatUsdc(json.amount)} to your wallet`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
            <Wallet className="h-5 w-5 text-[var(--blue-deep)]" />
          </div>
          <div className="leading-tight">
            <div className="text-2xl font-extrabold text-[var(--blue-deep)]">
              {formatUsdc(balance)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">
              🎧 streaming pocket · {formatUsdc(streamingEarned)} earned all-time
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={topUp} disabled={busy !== null} variant="outline" size="sm">
            {busy === "topup" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> topping up…
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" /> top up {formatUsdc(TOPUP_AMOUNT)}
              </>
            )}
          </Button>
          <Button onClick={withdraw} disabled={busy !== null || balance <= 0} size="sm">
            {busy === "withdraw" ? (
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
      </CardContent>
    </Card>
  );
}
