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

import { User } from "lucide-react";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { formatUsdc } from "@/lib/utils/royalty";

export interface BreakdownRow {
  name: string;
  type: "human" | "ai";
  splitPct: number;
  amount: number;
  status?: "PENDING" | "COMPLETE" | "FAILED";
  /** if this contributor flows in from an upstream work, its title */
  via?: string;
}

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  PENDING: { cls: "bg-[#FCEFD6] text-[#C99A3E]", label: "sending…" },
  COMPLETE: { cls: "bg-[#D6F5E3] text-[#3E9E68]", label: "paid ✓" },
  FAILED: { cls: "bg-[#FBE0EA] text-[#C75B86]", label: "failed" },
};

export function RoyaltyBreakdown({ rows }: { rows: BreakdownRow[] }) {
  const showStatus = rows.some((r) => r.status);

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        royalty split
      </p>
      {rows.map((row, i) => {
        const pill = row.status ? STATUS_PILL[row.status] : null;
        return (
          <div
            key={i}
            className="flex items-center justify-between rounded-2xl border-[1.5px] border-border bg-card/70 p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                {row.type === "ai" ? (
                  <KawaiiAI size={26} />
                ) : (
                  <User className="h-4 w-4 text-[var(--blue-deep)]" />
                )}
              </div>
              <div className="leading-tight">
                <span className="block text-sm font-extrabold">{row.name}</span>
                <span className="text-xs font-bold text-muted-foreground">
                  {row.splitPct}%{row.type === "ai" ? " · AI" : ""}
                  {row.via && (
                    <span className="text-[var(--lavender-deep)]"> · 🌿 via {row.via}</span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[var(--blue-deep)]">
                {formatUsdc(row.amount)}
              </span>
              {showStatus && pill && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${pill.cls}`}>
                  {pill.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
