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
import { Music, Image as ImageIcon, FileText, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { formatUsdc } from "@/lib/utils/royalty";
import { WorkWithContributors } from "@/types/royalty";

const TYPE_ICON = {
  music: Music,
  art: ImageIcon,
  writing: FileText,
} as const;

const TYPE_EMOJI = {
  music: "🎵",
  art: "🎨",
  writing: "✍️",
} as const;

export function WorkCard({ work }: { work: WorkWithContributors }) {
  const Icon = TYPE_ICON[work.work_type] ?? FileText;
  const contributors = work.contributors ?? [];
  const aiCount = contributors.filter((c) => c.contributor_type === "ai").length;

  return (
    <Link href={`/works/${work.id}`} className="block h-full">
      <Card className="h-full transition-transform duration-300 hover:-translate-y-1">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
              <Icon className="h-5 w-5 text-[var(--blue-deep)]" />
            </div>
            <span className="font-extrabold">{work.title}</span>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-extrabold capitalize text-secondary-foreground">
            {TYPE_EMOJI[work.work_type] ?? ""} {work.work_type}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {work.description && (
            <p className="line-clamp-2 text-sm font-medium text-muted-foreground">
              {work.description}
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3 font-bold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {contributors.length}
              </span>
              {aiCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--lavender-deep)]">
                  <KawaiiAI size={18} />
                  {aiCount} AI
                </span>
              )}
              {work.parent_work_id && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-accent-foreground">
                  🌿 remix
                </span>
              )}
            </div>
            <span className="font-extrabold text-[var(--blue-deep)]">
              {formatUsdc(work.license_price)}
            </span>
          </div>

          {(work.licenses_count ?? 0) > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-[#D6F5E3]/60 px-3 py-1 text-xs font-extrabold text-[#3E9E68]">
              licensed {work.licenses_count}× · {formatUsdc(work.earned ?? 0, 4)} paid out
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
