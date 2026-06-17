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
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { isAdminProfile } from "@/lib/utils/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportModeration } from "@/components/report-moderation";

export const dynamic = "force-dynamic";

/** Admin-only moderation queue of open plagiarism/abuse reports. */
export default async function AdminReportsPage() {
  const auth = createSupabaseServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return notFound();

  const { data: profile } = await auth
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!isAdminProfile(profile?.id)) return notFound();

  const service = createSupabaseServiceClient();
  const { data: reports } = await service
    .from("work_reports")
    .select(
      "id, reason, details, created_at, work:works!work_reports_work_id_fkey ( id, title, status )"
    )
    .eq("status", "OPEN")
    .order("created_at", { ascending: true });

  const rows = (reports ?? []) as any[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Reports queue</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No open reports. 🎉</p>
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                <Link href={`/works/${r.work?.id}`} className="hover:underline">
                  {r.work?.title ?? "(unknown work)"}
                </Link>{" "}
                <Badge variant="outline">{r.reason}</Badge>{" "}
                {r.work?.status && r.work.status !== "ACTIVE" && (
                  <Badge variant="outline" className="capitalize">
                    {String(r.work.status).toLowerCase()}
                  </Badge>
                )}
              </CardTitle>
              {r.work?.id && <ReportModeration workId={r.work.id} />}
            </CardHeader>
            <CardContent className="space-y-1">
              {r.details && (
                <p className="text-sm font-semibold text-muted-foreground">{r.details}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
