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
import { notFound } from "next/navigation";
import { User, ExternalLink, GitBranch, LogIn, Check, Headphones } from "lucide-react";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProvenanceChain } from "@/components/provenance-chain";
import { RoyaltyBreakdown, BreakdownRow } from "@/components/royalty-breakdown";
import { LicenseWorkButton } from "@/components/license-work-button";
import { ShareWorkButton } from "@/components/share-work-button";
import { WorkFileUpload } from "@/components/work-file-upload";
import { StreamingAudioPlayer } from "@/components/streaming-audio-player";
import { DownloadButton } from "@/components/download-button";
import { computeSplitAmounts, formatUsdc, UPSTREAM_SHARE_PCT } from "@/lib/utils/royalty";

export const dynamic = "force-dynamic";

const EXPLORER = "https://testnet.arcscan.app";
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "flac"];

export default async function WorkDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Public page — a viewer may be signed out.
  const auth = createSupabaseServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const service = createSupabaseServiceClient();
  const worksService = createWorksService(service);

  const work = await worksService.getWork(params.id);
  if (!work) return notFound();
  const provenance = await worksService.getProvenanceChain(params.id);
  const downstream = await worksService.getDownstreamStats(params.id);

  // Latest paid AI validation for this work (onchain_tx_hash present == a real
  // fee was paid to the validator, so we only badge genuinely-reviewed works).
  const { data: validation } = await service
    .from("validations")
    .select("confidence, onchain_tx_hash, created_at")
    .eq("work_id", params.id)
    .eq("verdict", "PASS")
    .eq("status", "COMPLETE")
    .not("onchain_tx_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let isOwner = false;
  let viewerWalletId: string | null = null;
  let alreadyLicensed = false;
  if (user) {
    const { data: profile } = await auth
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    isOwner = profile?.id === work.owner_profile_id;
    if (profile) {
      const { data: w } = await auth
        .from("wallets")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      viewerWalletId = w?.id ?? null;

      // Has this viewer already licensed this work? (don't let them re-buy)
      const { data: existing } = await auth
        .from("licenses")
        .select("id")
        .eq("work_id", work.id)
        .eq("buyer_profile_id", profile.id)
        .not("status", "in", "(FAILED,REFUNDED)")
        .limit(1);
      alreadyLicensed = (existing?.length ?? 0) > 0;
    }
  }

  const contributors = work.contributors ?? [];

  // Does the viewer already earn from this work (e.g. an upstream creator)?
  const viewerSplit = viewerWalletId
    ? contributors
        .filter((c) => c.wallet_id === viewerWalletId)
        .reduce((a, c) => a + Number(c.split_pct), 0)
    : 0;

  // If this is a remix, figure out which contributors flow in from the parent.
  let parentTitle = "";
  let upstreamWallets = new Set<string>();
  if (work.parent_work_id) {
    const parent = await worksService.getWork(work.parent_work_id);
    if (parent) {
      parentTitle = parent.title;
      upstreamWallets = new Set(
        (parent.contributors ?? []).map((c) => c.wallet_id)
      );
    }
  }
  const isUpstream = (walletId: string) => upstreamWallets.has(walletId);

  const amounts = computeSplitAmounts(work.license_price, contributors);
  const breakdownRows: BreakdownRow[] = contributors.map((c, i) => ({
    name: c.display_name,
    type: c.contributor_type,
    splitPct: Number(c.split_pct),
    amount: amounts[i] ?? 0,
    via: isUpstream(c.wallet_id) ? parentTitle : undefined,
  }));

  const ext = work.file_url?.split(".").pop()?.toLowerCase() ?? "";
  const isImage = IMAGE_EXT.includes(ext);
  const isAudio = AUDIO_EXT.includes(ext);
  const hasFile = !!work.file_url;
  const hasContributors = contributors.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        ← back to explore
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold">{work.title}</h1>
            <Badge variant="outline" className="capitalize">
              {work.work_type}
            </Badge>
            {validation && (
              <a
                href={`${EXPLORER}/tx/${validation.onchain_tx_hash}`}
                target="_blank"
                rel="noreferrer"
                title={
                  validation.confidence != null
                    ? `Reviewed by the STEM Validator (${Math.round(
                        Number(validation.confidence) * 100
                      )}% confidence)`
                    : "Reviewed by the STEM Validator"
                }
                className="inline-flex items-center gap-1 rounded-full bg-[#D6F5E3]/70 px-2.5 py-0.5 text-xs font-extrabold text-[#3E9E68] hover:brightness-95"
              >
                ✨ Validated by STEM Validator
              </a>
            )}
            {work.parent_work_id && (
              <Link
                href={`/works/${work.parent_work_id}`}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-extrabold text-secondary-foreground hover:brightness-95"
              >
                🌿 remix of {parentTitle || "another work"}
              </Link>
            )}
          </div>
          {work.description && (
            <p className="mt-1 font-semibold text-muted-foreground">
              {work.description}
            </p>
          )}
          {downstream.remixCount > 0 && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#D6F5E3]/60 px-3 py-1 text-xs font-extrabold text-[#3E9E68]">
              🌿 remixed {downstream.remixCount}×
              {downstream.downstreamEarned > 0 &&
                ` · ${formatUsdc(downstream.downstreamEarned, 4)} earned downstream`}
            </span>
          )}
        </div>
        {user && (isOwner || alreadyLicensed) && (
          <Button asChild variant="outline">
            <Link href={`/dashboard/works/new?parent=${work.id}`}>
              <GitBranch className="h-4 w-4" />
              register derivative
            </Link>
          </Button>
        )}
      </div>

      {provenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">provenance ☁️</CardTitle>
          </CardHeader>
          <CardContent>
            <ProvenanceChain chain={provenance} current={work} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">the work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isImage && work.file_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={work.file_url}
                alt={work.title}
                className="max-h-64 w-full rounded-2xl object-contain"
              />
            ) : isAudio && work.file_url ? (
              <StreamingAudioPlayer
                workId={work.id}
                title={work.title}
                // Owners, contributors, and anyone holding a valid license
                // stream free — no per-minute charge.
                free={isOwner || viewerSplit > 0 || alreadyLicensed}
                freeReason={isOwner || viewerSplit > 0 ? "creator" : "licensed"}
                signedIn={!!user}
              />
            ) : hasFile ? (
              <a
                href={work.file_url!}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-bold text-[var(--blue-deep)] hover:underline"
              >
                view file <ExternalLink className="h-4 w-4" />
              </a>
            ) : isOwner ? (
              <WorkFileUpload workId={work.id} />
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">
                no file uploaded yet.
              </p>
            )}

            {/* CTA depends on who's looking */}
            {isOwner ? (
              <ShareWorkButton />
            ) : user && alreadyLicensed ? (
              <div className="space-y-2 rounded-2xl bg-[#D6F5E3]/50 p-4 text-center">
                <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-[#3E9E68]">
                  <Check className="h-4 w-4" /> license owned — download &amp; remix unlocked
                </p>
                {hasFile && (
                  <DownloadButton workId={work.id} fileUrl={work.file_url!} />
                )}
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dashboard/works/new?parent=${work.id}`}>
                    <GitBranch className="h-4 w-4" /> remix this stem
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/dashboard/library">
                    <Headphones className="h-4 w-4" /> open in your library
                  </Link>
                </Button>
              </div>
            ) : user ? (
              <>
                {viewerSplit > 0 && (
                  <p className="rounded-2xl bg-secondary/30 p-3 text-xs font-bold text-secondary-foreground">
                    💛 you earn {viewerSplit}% of this work — you can still license it
                    (maybe you just want to listen!), and your cut floats right back to
                    you.
                  </p>
                )}
                <LicenseWorkButton
                  workId={work.id}
                  price={work.license_price}
                  disabled={!hasFile || !hasContributors}
                />
                {(!hasFile || !hasContributors) && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    this work isn&apos;t ready to license yet.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2 rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-4 text-center">
                <p className="text-2xl font-extrabold text-[var(--blue-deep)]">
                  {formatUsdc(work.license_price)}
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  sign in to license this work — the fee floats straight to its
                  creators.
                </p>
                <Button asChild className="w-full">
                  <Link href="/sign-in">
                    <LogIn className="h-4 w-4" /> sign in to license
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">contributors &amp; royalty split</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {contributors.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border-[1.5px] border-border bg-card/70 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                      {c.contributor_type === "ai" ? (
                        <KawaiiAI size={22} />
                      ) : (
                        <User className="h-4 w-4 text-[var(--blue-deep)]" />
                      )}
                    </div>
                    <span className="text-sm font-extrabold">{c.display_name}</span>
                    {isUpstream(c.wallet_id) && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-[var(--lavender-deep)]">
                        🌿 via {parentTitle}
                      </span>
                    )}
                    {c.erc8004_agent_id && (
                      <a
                        href={
                          c.erc8004_tx_hash
                            ? `${EXPLORER}/tx/${c.erc8004_tx_hash}`
                            : `${EXPLORER}/address/${c.wallet?.wallet_address}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-accent-foreground hover:brightness-95"
                      >
                        ✨ ERC-8004 #{c.erc8004_agent_id}
                      </a>
                    )}
                  </div>
                  <span className="text-sm font-extrabold text-[var(--blue-deep)]">
                    {Number(c.split_pct)}%
                  </span>
                </div>
              ))}
            </div>
            <div>
              {work.parent_work_id && (
                <p className="mb-2 rounded-2xl bg-secondary/30 p-2.5 text-xs font-bold text-secondary-foreground">
                  🌿 this is a remix — {UPSTREAM_SHARE_PCT}% of every license floats
                  upstream to {parentTitle ? `“${parentTitle}”` : "the original"}&apos;s
                  creators.
                </p>
              )}
              <p className="mb-2 text-sm font-bold text-muted-foreground">
                projected payout at {formatUsdc(work.license_price)}:
              </p>
              <RoyaltyBreakdown rows={breakdownRows} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
