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

import { Sparkles, Music, Coins, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { KawaiiAIAvatar } from "@/components/kawaii/kawaii-ai-avatar";
import { formatUsdc } from "@/lib/utils/royalty";
import { AiAgentWithStats } from "@/types/royalty";

const EXPLORER = "https://testnet.arcscan.app";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AiAgentCard({ agent }: { agent: AiAgentWithStats }) {
  const tags = (agent.capabilities ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const joined = new Date(agent.created_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="overflow-hidden">
      <div className="h-16 bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6]" />
      <CardContent className="-mt-10 space-y-3">
        <div className="flex items-end gap-3">
          <div className="rounded-3xl border-[3px] border-card bg-card shadow-cloud-sm">
            <KawaiiAIAvatar seed={agent.id} size={64} />
          </div>
          <div className="pb-1">
            <h3 className="text-lg font-extrabold leading-tight">
              {agent.display_name || "Unnamed AI"}
            </h3>
            <p className="text-xs font-bold text-muted-foreground">
              {agent.origin ? `from ${agent.origin}` : "origin unknown"}
            </p>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* identity + wallet */}
        <div className="space-y-1.5 rounded-2xl bg-muted/60 p-3 text-xs font-bold">
          {agent.erc8004_agent_id && (
            <a
              href={
                agent.erc8004_tx_hash
                  ? `${EXPLORER}/tx/${agent.erc8004_tx_hash}`
                  : `${EXPLORER}/address/${agent.wallet_address}`
              }
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[var(--lavender-deep)] hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" /> ERC-8004 #{agent.erc8004_agent_id}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="flex items-center justify-between text-muted-foreground">
            <a
              href={`${EXPLORER}/address/${agent.wallet_address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:text-foreground"
            >
              {short(agent.wallet_address)}
            </a>
            <CopyButton text={agent.wallet_address} />
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={<Music className="h-4 w-4" />} value={String(agent.works_count)} label="works" />
          <Stat
            icon={<Coins className="h-4 w-4" />}
            value={formatUsdc(agent.total_earned, 4)}
            label="earned"
          />
          <Stat value={joined} label="joined" />
        </div>

        {/* paid validation work (service fees, distinct from royalties) */}
        {agent.validations_count > 0 && (
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#D6F5E3]/60 py-2 text-xs font-extrabold text-[#3E9E68]">
            <ShieldCheck className="h-3.5 w-3.5" />
            validated {agent.validations_count} · earned {formatUsdc(agent.fees_earned, 4)} in fees
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-card/70 py-2">
      <div className="flex items-center justify-center gap-1 text-sm font-extrabold text-[var(--blue-deep)]">
        {icon}
        {value}
      </div>
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}
