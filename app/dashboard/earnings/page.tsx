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
import { redirect } from "next/navigation";
import { User } from "lucide-react";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createEarningsService } from "@/app/services/earnings.service";
import { Card, CardContent } from "@/components/ui/card";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { KawaiiWallet } from "@/components/kawaii/kawaii-wallet";
import { EmptyState } from "@/components/kawaii/empty-state";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { PocketCard } from "@/components/pocket-card";
import { formatUsdc } from "@/lib/utils/royalty";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  PENDING: "bg-[#FCEFD6] text-[#C99A3E]",
  COMPLETE: "bg-[#D6F5E3] text-[#3E9E68]",
  FAILED: "bg-[#FBE0EA] text-[#C75B86]",
};

export default async function EarningsPage() {
  const supabase = createSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  const earnings = profile
    ? await createEarningsService(createSupabaseServiceClient()).getEarnings(
        profile.id
      )
    : {
        total: 0,
        pending: 0,
        fromRemixTotal: 0,
        aiEarned: 0,
        items: [],
        pocketBalance: 0,
        streamingEarned: 0,
      };

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6] p-7">
        <SparkleDecoration count={7} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <KawaiiWallet size={64} />
            <div>
              <h1 className="text-3xl font-extrabold">your earnings</h1>
              <p className="font-semibold text-muted-foreground">
                Royalties and streams that floated to your wallet. Your AI agents&apos;
                royalties are tracked separately.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-extrabold text-[var(--blue-deep)]">
              {formatUsdc(earnings.total + earnings.streamingEarned, 4)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">
              total earned all-time
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          license royalties
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="earned (settled)" value={formatUsdc(earnings.total, 4)} big />
          <StatCard label="🌿 from remixes" value={formatUsdc(earnings.fromRemixTotal, 4)} />
          <StatCard label="pending" value={formatUsdc(earnings.pending, 4)} />
          <Link href="/dashboard/ai" className="block transition-transform hover:scale-[1.02]">
            <StatCard label="🤖 your AI agents →" value={formatUsdc(earnings.aiEarned, 4)} />
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          streaming (pay-per-listen)
        </h2>
        <PocketCard
          balance={earnings.pocketBalance}
          streamingEarned={earnings.streamingEarned}
        />
      </section>

      {earnings.items.length === 0 ? (
        <EmptyState
          title="no royalties yet…"
          hint="Once your works (or remixes of them) get licensed, the USDC lands here — and you'll see which cuts came from downstream remixes."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">royalty feed</h2>
          <div className="space-y-2">
            {earnings.items.map((it) => (
              <Card key={it.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                      {it.recipientType === "ai" ? (
                        <KawaiiAI size={24} />
                      ) : (
                        <User className="h-4 w-4 text-[var(--blue-deep)]" />
                      )}
                    </div>
                    <div className="leading-tight">
                      <span className="block text-sm font-extrabold">
                        {it.recipientName}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">
                        from{" "}
                        {it.workId ? (
                          <Link
                            href={`/works/${it.workId}`}
                            className="text-[var(--blue-deep)] hover:underline"
                          >
                            {it.workTitle}
                          </Link>
                        ) : (
                          it.workTitle
                        )}
                        {it.fromRemix && (
                          <span className="text-[var(--lavender-deep)]">
                            {" "}
                            · 🌿 downstream remix
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[var(--blue-deep)]">
                      {formatUsdc(it.amount, 4)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                        STATUS_PILL[it.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {it.status === "COMPLETE" ? "paid ✓" : it.status.toLowerCase()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
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
            big ? "text-4xl" : "text-2xl"
          }`}
        >
          {value}
        </div>
        <div className="text-xs font-bold text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
