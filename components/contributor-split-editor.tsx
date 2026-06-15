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

import { User, Trash2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { KawaiiAIAvatar } from "@/components/kawaii/kawaii-ai-avatar";

export interface AiRosterItem {
  id: string; // wallet id
  display_name: string;
  origin: string | null;
  erc8004_agent_id: string | null;
  erc8004_tx_hash: string | null;
}

export interface ContributorRow {
  key: string;
  type: "human" | "ai";
  displayName: string;
  email: string;
  origin: string;
  capabilities: string;
  splitPct: number;
  isOwner: boolean;
  /** selected existing AI agent (wallet id); "" means create a new one */
  aiWalletId: string;
  /** upstream provenance row — read-only, paid by wallet id */
  locked?: boolean;
  /** the parent work this upstream contributor flows from */
  viaLabel?: string;
  /** direct wallet id for locked upstream rows */
  walletId?: string;
}

const NEW_AI = "__new__";

export function newRow(type: "human" | "ai"): ContributorRow {
  return {
    key: Math.random().toString(36).slice(2),
    type,
    displayName: "",
    email: "",
    origin: "",
    capabilities: "",
    splitPct: 0,
    isOwner: false,
    aiWalletId: "",
  };
}

const selectClass =
  "flex h-11 w-full rounded-2xl border-[1.5px] border-border bg-input px-4 text-sm font-bold focus-visible:outline-none focus-visible:border-[var(--blue-deep)] focus-visible:ring-4 focus-visible:ring-ring/40";

interface Props {
  rows: ContributorRow[];
  onChange: (rows: ContributorRow[]) => void;
  aiAgents: AiRosterItem[];
}

export function ContributorSplitEditor({ rows, onChange, aiAgents }: Props) {
  const total = rows.reduce((acc, r) => acc + (Number(r.splitPct) || 0), 0);
  const isValid = Math.abs(total - 100) < 0.01;

  const update = (key: string, patch: Partial<ContributorRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));

  const addHuman = () => onChange([...rows, newRow("human")]);

  const addAi = () => {
    const row = newRow("ai");
    // default to the first existing agent, else "create new"
    if (aiAgents.length > 0) {
      row.aiWalletId = aiAgents[0].id;
      row.displayName = aiAgents[0].display_name;
    } else {
      row.aiWalletId = NEW_AI;
    }
    onChange([...rows, row]);
  };

  const onPickAi = (key: string, value: string) => {
    if (value === NEW_AI) {
      update(key, { aiWalletId: NEW_AI, displayName: "" });
    } else {
      const agent = aiAgents.find((a) => a.id === value);
      update(key, { aiWalletId: value, displayName: agent?.display_name ?? "" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-extrabold">
          contributors &amp; royalty splits
        </Label>
        <span
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
            isValid ? "bg-[#D6F5E3] text-[#3E9E68]" : "bg-[#FCEFD6] text-[#C99A3E]"
          }`}
        >
          {isValid && <Sparkles className="h-3 w-3" />}
          {total.toFixed(2)}% / 100%
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          // Locked upstream provenance row — read-only.
          if (row.locked) {
            return (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-2xl border-[1.5px] border-dashed border-[var(--lavender-deep)]/50 bg-secondary/30 p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card">
                    {row.type === "ai" && row.walletId ? (
                      <KawaiiAIAvatar seed={row.walletId} size={30} />
                    ) : (
                      <User className="h-4 w-4 text-[var(--blue-deep)]" />
                    )}
                  </div>
                  <div className="leading-tight">
                    <span className="block text-sm font-extrabold">
                      {row.displayName}
                    </span>
                    <span className="text-xs font-bold text-[var(--lavender-deep)]">
                      🌿 via {row.viaLabel}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-extrabold text-[var(--lavender-deep)]">
                  {row.splitPct}%
                </span>
              </div>
            );
          }

          const selectedAgent =
            row.type === "ai" && row.aiWalletId !== NEW_AI
              ? aiAgents.find((a) => a.id === row.aiWalletId)
              : undefined;
          const creatingNew = row.type === "ai" && row.aiWalletId === NEW_AI;

          return (
            <div
              key={row.key}
              className="flex items-start gap-2 rounded-2xl border-[1.5px] border-border bg-card/70 p-3"
            >
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                {row.type === "ai" ? (
                  selectedAgent ? (
                    <KawaiiAIAvatar seed={selectedAgent.id} size={30} />
                  ) : (
                    <KawaiiAI size={26} />
                  )
                ) : (
                  <User className="h-4 w-4 text-[var(--blue-deep)]" />
                )}
              </div>

              <div className="grid flex-1 gap-2">
                {/* HUMAN */}
                {row.type === "human" && (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="flex-1 min-w-[160px]"
                      placeholder="Name"
                      value={row.displayName}
                      disabled={row.isOwner}
                      onChange={(e) => update(row.key, { displayName: e.target.value })}
                    />
                    {!row.isOwner && (
                      <Input
                        className="flex-1 min-w-[160px]"
                        placeholder="Email of registered user"
                        value={row.email}
                        onChange={(e) => update(row.key, { email: e.target.value })}
                      />
                    )}
                  </div>
                )}

                {/* AI — pick existing or create new */}
                {row.type === "ai" && (
                  <>
                    <select
                      className={selectClass}
                      value={row.aiWalletId}
                      onChange={(e) => onPickAi(row.key, e.target.value)}
                    >
                      {aiAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.display_name}
                          {a.origin ? ` — ${a.origin}` : ""}
                        </option>
                      ))}
                      <option value={NEW_AI}>＋ create a new AI…</option>
                    </select>

                    {creatingNew && (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="flex-1 min-w-[150px]"
                          placeholder="AI name (e.g. Claude Composer)"
                          value={row.displayName}
                          onChange={(e) =>
                            update(row.key, { displayName: e.target.value })
                          }
                        />
                        <Input
                          className="flex-1 min-w-[150px]"
                          placeholder="From (e.g. Anthropic Claude)"
                          value={row.origin}
                          onChange={(e) => update(row.key, { origin: e.target.value })}
                        />
                        <Input
                          className="flex-1 min-w-[150px]"
                          placeholder="Capabilities (comma separated)"
                          value={row.capabilities}
                          onChange={(e) =>
                            update(row.key, { capabilities: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </>
                )}

                {row.isOwner && (
                  <span className="text-xs font-bold text-muted-foreground">
                    💛 you (work owner) — paid into your wallet
                  </span>
                )}
                {selectedAgent?.erc8004_agent_id && (
                  <span className="text-xs font-bold text-[var(--lavender-deep)]">
                    ✨ reusing existing identity · ERC-8004 #
                    {selectedAgent.erc8004_agent_id}
                  </span>
                )}
                {creatingNew && (
                  <span className="text-xs font-bold text-[var(--lavender-deep)]">
                    ✨ mints a fresh Circle wallet + ERC-8004 identity on Arc
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="w-20 text-right"
                  value={row.splitPct === 0 ? "" : row.splitPct}
                  onChange={(e) =>
                    update(row.key, { splitPct: parseFloat(e.target.value) || 0 })
                  }
                />
                <span className="text-sm font-bold text-muted-foreground">%</span>
              </div>

              {!row.isOwner && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(row.key)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addHuman}>
          <User className="h-4 w-4" /> add human
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addAi}>
          <KawaiiAI size={18} /> add AI contributor
        </Button>
      </div>

      {!isValid && (
        <p className="text-sm font-bold text-[#C99A3E]">
          🫧 splits must add up to exactly 100% before you can register.
        </p>
      )}
    </div>
  );
}
