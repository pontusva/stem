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
import { Plus } from "lucide-react";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WalletBalance } from "@/components/wallet-balance";
import { RequestUsdcButton } from "@/components/request-usdc-button";
import { USDCButton } from "@/components/usdc-button";
import { WalletInformationDialog } from "@/components/wallet-information-dialog";
import { WorksCatalog } from "@/components/works-catalog";
import { KawaiiWallet } from "@/components/kawaii/kawaii-wallet";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { createEarningsService } from "@/app/services/earnings.service";
import { formatUsdc } from "@/lib/utils/royalty";
import { ArrowRight, Headphones, Music, Coins } from "lucide-react";

export default async function DashboardPage() {
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

  const { data: wallet } = await supabase
    .from("wallets")
    .select()
    .eq("profile_id", profile?.id)
    .single();

  const service = createSupabaseServiceClient();
  const worksService = createWorksService(service);
  const works = await worksService.listWorks();

  const earnings = profile
    ? await createEarningsService(service).getEarnings(profile.id)
    : { total: 0, pending: 0, fromRemixTotal: 0, items: [] };

  // Licenses where the user is the buyer or owns the underlying work.
  const ownedIds = works
    .filter((w) => w.owner_profile_id === profile?.id)
    .map((w) => w.id);

  const { data: buyerLicenses } = await service
    .from("licenses")
    .select(`*, work:works!licenses_work_id_fkey ( title )`)
    .eq("buyer_profile_id", profile?.id)
    .order("created_at", { ascending: false });

  let ownerLicenses: any[] = [];
  if (ownedIds.length) {
    const { data } = await service
      .from("licenses")
      .select(`*, work:works!licenses_work_id_fkey ( title )`)
      .in("work_id", ownedIds)
      .order("created_at", { ascending: false });
    ownerLicenses = data ?? [];
  }

  const bought = buyerLicenses ?? [];
  const sold = ownerLicenses;

  return (
    <div className="space-y-10">
      {/* Top row: wallet + register CTA */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Wallet cloud */}
        <Card className="relative overflow-hidden">
          <SparkleDecoration count={5} />
          <CardHeader className="relative flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KawaiiWallet size={40} />
              my pocket
            </CardTitle>
            {wallet && <WalletInformationDialog wallet={wallet} />}
          </CardHeader>
          <CardContent className="relative">
            <div className="grid w-full items-center gap-6">
              <h1 className="text-5xl font-extrabold tracking-tight text-[var(--blue-deep)]">
                {wallet ? (
                  <WalletBalance walletId={wallet.circle_wallet_id} />
                ) : (
                  "$0.00"
                )}
              </h1>
              {wallet && (
                <div className="flex flex-wrap gap-2">
                  <USDCButton className="flex-1" mode="BUY" walletAddress={wallet.wallet_address} />
                  <USDCButton className="flex-1" mode="SELL" walletAddress={wallet.wallet_address} />
                  {process.env.NODE_ENV === "development" && (
                    <RequestUsdcButton walletAddress={wallet.wallet_address} />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Register CTA cloud */}
        <Card className="relative flex flex-col justify-center overflow-hidden bg-gradient-to-br from-card to-[#F3EDFE]">
          <CardContent className="flex items-center gap-5 py-7">
            <StemCloud size={92} float className="shrink-0" />
            <div className="space-y-3">
              <h2 className="text-xl font-extrabold">register a stem ✿</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Add a work, name everyone who made it — humans &amp; AI — and let
                royalties float back when it&apos;s licensed.
              </p>
              <Button asChild>
                <Link href="/dashboard/works/new">
                  <Plus className="h-4 w-4" /> Register a work
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Earnings strip */}
      <Link href="/dashboard/earnings" className="block">
        <Card className="transition-transform duration-200 hover:-translate-y-0.5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <KawaiiWallet size={40} />
              <div>
                <div className="text-2xl font-extrabold text-[var(--blue-deep)]">
                  {formatUsdc(earnings.total, 4)}
                </div>
                <div className="text-xs font-bold text-muted-foreground">
                  earned so far
                  {earnings.fromRemixTotal > 0 &&
                    ` · ${formatUsdc(earnings.fromRemixTotal, 4)} from remixes`}
                </div>
              </div>
            </div>
            <span className="flex items-center gap-1 text-sm font-extrabold text-muted-foreground">
              view earnings <ArrowRight className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>
      </Link>

      {/* Licenses you bought (→ your library) */}
      {bought.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-extrabold">
              <Headphones className="h-6 w-6 text-[var(--blue-deep)]" />
              you bought
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm text-secondary-foreground">
                {bought.length}
              </span>
            </h2>
            <Link
              href="/dashboard/library"
              className="flex items-center gap-1 text-sm font-extrabold text-muted-foreground hover:text-foreground"
            >
              open library <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {bought.map((l) => (
              <LicenseRow key={l.id} license={l} kind="bought" />
            ))}
          </div>
        </section>
      )}

      {/* Sales of your works (→ revenue) */}
      {sold.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold">
            <Coins className="h-6 w-6 text-[#3E9E68]" />
            you sold
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm text-secondary-foreground">
              {sold.length}
            </span>
          </h2>
          <p className="-mt-2 text-sm font-semibold text-muted-foreground">
            licenses other people bought of your works — the royalties land in your
            earnings.
          </p>
          <div className="space-y-3">
            {sold.map((l) => (
              <LicenseRow key={l.id} license={l} kind="sold" />
            ))}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold">works catalog ☁️</h2>
        <WorksCatalog works={works} />
      </section>
    </div>
  );
}

function LicenseRow({
  license,
  kind,
}: {
  license: any;
  kind: "bought" | "sold";
}) {
  const href =
    kind === "bought"
      ? `/works/${license.work_id}`
      : `/dashboard/licenses/${license.id}`;
  return (
    <Link href={href} className="block">
      <Card className="transition-transform duration-200 hover:-translate-y-0.5">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Music className="h-4 w-4 text-[var(--blue-deep)]" />
            <span className="font-bold">{license.work?.title ?? "Work"}</span>
            <Badge variant="outline">{license.status}</Badge>
          </div>
          <span className="font-extrabold text-[var(--blue-deep)]">
            {formatUsdc(license.amount_usdc)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
