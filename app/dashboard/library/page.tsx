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
import { Music, Image as ImageIcon, FileText, ExternalLink } from "lucide-react";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/kawaii/empty-state";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";
import { formatUsdc } from "@/lib/utils/royalty";

export const dynamic = "force-dynamic";

const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

const TYPE_ICON = { music: Music, art: ImageIcon, writing: FileText } as const;

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  CLOSED: { cls: "bg-[#D6F5E3] text-[#3E9E68]", label: "licensed ✓" },
  SPLITTING: { cls: "bg-secondary text-secondary-foreground", label: "paying out…" },
  FUNDED: { cls: "bg-[#DCEBFB] text-[#5C8FCF]", label: "in escrow" },
  SUBMITTED: { cls: "bg-[#DCEBFB] text-[#5C8FCF]", label: "in escrow" },
  COMPLETED: { cls: "bg-[#DCEBFB] text-[#5C8FCF]", label: "releasing" },
};

export default async function LibraryPage() {
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

  const service = createSupabaseServiceClient();
  const { data: licenses } = profile
    ? await service
        .from("licenses")
        .select(
          `id, amount_usdc, status, created_at,
           work:works!licenses_work_id_fkey ( id, title, work_type, file_url )`
        )
        .eq("buyer_profile_id", profile.id)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const items = (licenses ?? []) as any[];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6] p-7">
        <SparkleDecoration count={7} />
        <div className="relative flex items-center gap-4">
          <StemCloud size={76} float />
          <div>
            <h1 className="text-3xl font-extrabold">your library 🎧</h1>
            <p className="font-semibold text-muted-foreground">
              Every work you&apos;ve licensed — yours to listen to and enjoy.
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="your library is empty…"
          hint="License a work from explore and it&apos;ll appear here — ready to play."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((lic) => {
            const work = lic.work;
            if (!work) return null;
            const Icon = TYPE_ICON[work.work_type as keyof typeof TYPE_ICON] ?? FileText;
            const ext = work.file_url?.split(".").pop()?.toLowerCase() ?? "";
            const pill = STATUS_PILL[lic.status];

            return (
              <Card key={lic.id} className="overflow-hidden">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
                      <Icon className="h-5 w-5 text-[var(--blue-deep)]" />
                    </div>
                    <Link
                      href={`/works/${work.id}`}
                      className="font-extrabold hover:underline"
                    >
                      {work.title}
                    </Link>
                  </div>
                  {pill && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* the actual media */}
                  {work.file_url && AUDIO_EXT.includes(ext) ? (
                    <audio controls className="w-full" src={work.file_url} />
                  ) : work.file_url && IMAGE_EXT.includes(ext) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={work.file_url}
                      alt={work.title}
                      className="max-h-44 w-full rounded-2xl object-contain"
                    />
                  ) : work.file_url ? (
                    <a
                      href={work.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 font-bold text-[var(--blue-deep)] hover:underline"
                    >
                      open file <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-muted-foreground">
                      no file attached.
                    </p>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-muted-foreground capitalize">
                      {work.work_type}
                    </span>
                    <span className="font-extrabold text-[var(--blue-deep)]">
                      paid {formatUsdc(lic.amount_usdc)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
