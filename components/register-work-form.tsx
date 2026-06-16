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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ContributorSplitEditor,
  ContributorRow,
  AiRosterItem,
} from "@/components/contributor-split-editor";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { uploadWorkFile } from "@/lib/utils/client-upload";
import { scaleUpstreamSplits, UPSTREAM_SHARE_PCT } from "@/lib/utils/royalty";
import { WorkType } from "@/types/royalty";

interface ParentWorkOption {
  id: string;
  title: string;
}

interface Props {
  ownerName: string;
  ownerWalletId: string;
  parentWorks: ParentWorkOption[];
  initialParentId?: string;
}

const selectClass =
  "flex h-11 w-full rounded-2xl border-[1.5px] border-border bg-input px-4 text-sm font-bold focus-visible:outline-none focus-visible:border-[var(--blue-deep)] focus-visible:ring-4 focus-visible:ring-ring/40";

export function RegisterWorkForm({
  ownerName,
  ownerWalletId,
  parentWorks,
  initialParentId,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workType, setWorkType] = useState<WorkType>("music");
  const [parentWorkId, setParentWorkId] = useState(initialParentId ?? "");
  const [parentTitle, setParentTitle] = useState("");
  const [licensePrice, setLicensePrice] = useState("10");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("");
  const [aiAgents, setAiAgents] = useState<AiRosterItem[]>([]);

  // Load the user's reusable AI agents for the picker.
  useEffect(() => {
    fetch("/api/ai-agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((j) => setAiAgents(j.agents ?? []))
      .catch(() => setAiAgents([]));
  }, []);

  const [rows, setRows] = useState<ContributorRow[]>([
    {
      key: "owner",
      type: "human",
      displayName: ownerName,
      email: "",
      origin: "",
      capabilities: "",
      splitPct: 100,
      isOwner: true,
      aiWalletId: "",
    },
  ]);

  // Provenance rule: when this work is a remix, reserve a fixed upstream share
  // for the parent's creators by injecting them as locked contributor rows.
  useEffect(() => {
    let cancelled = false;
    async function syncUpstream() {
      if (!parentWorkId) {
        setParentTitle("");
        setRows((prev) => {
          const own = prev.filter((r) => !r.locked);
          if (own.length === 1 && own[0].isOwner) {
            return [{ ...own[0], splitPct: 100 }];
          }
          return own;
        });
        return;
      }
      const res = await fetch(`/api/works/${parentWorkId}`);
      if (!res.ok || cancelled) return;
      const { work } = await res.json();
      const parentContribs: any[] = work.contributors ?? [];
      const scaled = scaleUpstreamSplits(parentContribs);
      const upstreamTotal = scaled.reduce((a, b) => a + b, 0);
      const locked: ContributorRow[] = parentContribs
        .map((c, i) => ({
          key: `up-${c.id}`,
          type: c.contributor_type as "human" | "ai",
          displayName: c.display_name,
          email: "",
          origin: "",
          capabilities: "",
          splitPct: scaled[i],
          isOwner: false,
          aiWalletId: "",
          locked: true,
          viaLabel: work.title,
          walletId: c.wallet_id,
        }))
        // Drop ancestors diluted below the storable minimum (they'd earn dust).
        .filter((r) => r.splitPct > 0);
      if (cancelled) return;
      setParentTitle(work.title);
      setRows((prev) => {
        let own = prev.filter((r) => !r.locked);
        if (own.length === 1 && own[0].isOwner) {
          own = [
            { ...own[0], splitPct: Math.round((100 - upstreamTotal) * 100) / 100 },
          ];
        }
        return [...locked, ...own];
      });
    }
    syncUpstream();
    return () => {
      cancelled = true;
    };
  }, [parentWorkId]);

  const total = rows.reduce((acc, r) => acc + (Number(r.splitPct) || 0), 0);
  const splitsValid = Math.abs(total - 100) < 0.01;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required");
    if (!file) return toast.error("Please upload a work file — it's required to license the work");
    if (!splitsValid) return toast.error("Splits must total 100%");
    for (const r of rows) {
      if (r.locked) continue; // upstream provenance rows are pre-resolved
      if (!r.displayName.trim()) return toast.error("Every contributor needs a name");
      if (r.type === "human" && !r.isOwner && !r.email.trim()) {
        return toast.error(`Human contributor "${r.displayName}" needs an email`);
      }
    }

    setSubmitting(true);
    try {
      // 1. Create the work.
      setStep("Registering work…");
      const workRes = await fetch("/api/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          workType,
          parentWorkId: parentWorkId || null,
          licensePrice: parseFloat(licensePrice) || 0,
        }),
      });
      const workJson = await workRes.json();
      if (!workRes.ok) throw new Error(workJson.error || "Failed to create work");
      const workId = workJson.work.id as string;

      // 2. Upload the file — straight to Storage from the browser (bypasses the
      //    serverless body limit), then finalize.
      if (file) {
        setStep("Uploading file…");
        await uploadWorkFile(workId, file);
      }

      // 3. Resolve AI contributors — reuse an existing agent, or mint a new one.
      const contributors = [];
      for (const r of rows) {
        if (r.locked) {
          // Upstream provenance contributor — paid by its existing wallet id.
          contributors.push({
            contributor_type: r.type,
            display_name: r.displayName,
            split_pct: r.splitPct,
            wallet_id: r.walletId,
          });
          continue;
        }
        if (r.type === "ai") {
          const existing = aiAgents.find((a) => a.id === r.aiWalletId);
          if (existing) {
            contributors.push({
              contributor_type: "ai",
              display_name: existing.display_name,
              split_pct: r.splitPct,
              wallet_id: existing.id,
              erc8004_agent_id: existing.erc8004_agent_id,
              erc8004_tx_hash: existing.erc8004_tx_hash,
            });
          } else {
            setStep(`Summoning ${r.displayName}…`);
            const aiRes = await fetch("/api/ai-agents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                displayName: r.displayName,
                origin: r.origin,
                capabilities: r.capabilities,
              }),
            });
            const aiJson = await aiRes.json();
            if (!aiRes.ok) throw new Error(aiJson.error || "AI agent failed");
            const agent = aiJson.agent;
            contributors.push({
              contributor_type: "ai",
              display_name: agent.display_name,
              split_pct: r.splitPct,
              wallet_id: agent.id,
              erc8004_agent_id: agent.erc8004_agent_id,
              erc8004_tx_hash: agent.erc8004_tx_hash,
            });
          }
        } else if (r.isOwner) {
          contributors.push({
            contributor_type: "human",
            display_name: r.displayName,
            split_pct: r.splitPct,
            wallet_id: ownerWalletId,
          });
        } else {
          contributors.push({
            contributor_type: "human",
            display_name: r.displayName,
            split_pct: r.splitPct,
            email: r.email,
          });
        }
      }

      // 4. Attach contributors.
      setStep("Saving contributors…");
      const contribRes = await fetch(`/api/works/${workId}/contributors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributors }),
      });
      const contribJson = await contribRes.json();
      if (!contribRes.ok) {
        throw new Error(contribJson.error || "Failed to save contributors");
      }

      toast.success("Work registered!");
      router.push(`/dashboard/works/${workId}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setSubmitting(false);
      setStep("");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-4 space-y-0">
        <StemCloud size={64} float className="shrink-0" />
        <div>
          <CardTitle className="text-2xl">register a stem ✿</CardTitle>
          <CardDescription className="font-semibold">
            name who made it — humans &amp; AI — and how royalties float out when
            it&apos;s licensed.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Midnight Remix"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A lo-fi remix of the original track"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="work-type">Type</Label>
              <select
                id="work-type"
                className={selectClass}
                value={workType}
                onChange={(e) => setWorkType(e.target.value as WorkType)}
              >
                <option value="music">Music</option>
                <option value="art">Art</option>
                <option value="writing">Writing</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="price">License price (USDC)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={licensePrice}
                onChange={(e) => setLicensePrice(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="parent">Derived from (optional)</Label>
              <select
                id="parent"
                className={selectClass}
                value={parentWorkId}
                onChange={(e) => setParentWorkId(e.target.value)}
              >
                <option value="">— Original work —</option>
                {parentWorks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="file">Work file (image, audio, pdf)</Label>
            <Input
              id="file"
              type="file"
              accept="image/*,audio/*,.mp3,.wav,.ogg,.flac,application/pdf,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {parentWorkId && (
            <div className="rounded-2xl border-[1.5px] border-dashed border-[var(--lavender-deep)]/50 bg-secondary/30 p-3 text-sm font-bold text-secondary-foreground">
              🌿 this is a remix — stem&apos;s provenance rule sends{" "}
              <span className="text-[var(--lavender-deep)]">{UPSTREAM_SHARE_PCT}%</span>{" "}
              of every license back to{" "}
              {parentTitle ? `“${parentTitle}”` : "the original"}&apos;s creators
              (locked rows below). You split the remaining {100 - UPSTREAM_SHARE_PCT}%.
            </div>
          )}

          <ContributorSplitEditor rows={rows} onChange={setRows} aiAgents={aiAgents} />

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !splitsValid}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {step || "Working…"}
              </>
            ) : (
              "Register work"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
