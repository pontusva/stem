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

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";
import { getCurrentUser } from "@/lib/utils/current-user";
import { splitsAreValid } from "@/lib/utils/royalty";

export const dynamic = "force-dynamic";

/**
 * POST /api/works/[id]/publish — the single "go live" transition (owner-only).
 *
 * A work is DRAFT until this passes, then becomes ACTIVE (publicly listed and
 * licensable). It requires a file and valid contributor splits. If the upload
 * matched an existing work (suspected_parent_work_id set by the originality
 * gate), publishing is refused with 409 until the owner declares that work as
 * parent — turning the re-upload into an attributed remix (20% upstream). A
 * refusal simply leaves the work unpublished.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const worksService = createWorksService(service);

  const { data: work } = await service
    .from("works")
    .select("id, owner_profile_id, status, file_path, parent_work_id, suspected_parent_work_id")
    .eq("id", params.id)
    .single();
  if (!work) {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }
  if (work.owner_profile_id !== user.profileId) {
    return NextResponse.json(
      { error: "Only the work owner can publish it" },
      { status: 403 }
    );
  }
  if (work.status === "BLOCKED") {
    return NextResponse.json(
      { error: "This work has been removed and can't be published" },
      { status: 403 }
    );
  }
  if (!work.file_path) {
    return NextResponse.json(
      { error: "Attach a file before publishing" },
      { status: 400 }
    );
  }

  // Attribution can set/replace the parent at publish time (the form does this
  // when the upload matched an existing work and the owner accepts the remix).
  let parentWorkId: string | null = work.parent_work_id;
  try {
    const body = await req.json();
    if (typeof body.parentWorkId === "string" && body.parentWorkId) {
      parentWorkId = body.parentWorkId;
    }
  } catch {
    // no body — keep the existing parent
  }
  if (parentWorkId !== work.parent_work_id) {
    await service.from("works").update({ parent_work_id: parentWorkId }).eq("id", params.id);
    work.parent_work_id = parentWorkId;
  }

  // Contributor splits must total 100% (royalties have to add up).
  const { data: contributors } = await service
    .from("contributors")
    .select("split_pct")
    .eq("work_id", params.id);
  const splits = splitsAreValid(contributors ?? []);
  if (!splits.valid) {
    return NextResponse.json(
      { error: `Contributor splits must total 100% (currently ${splits.total}%)` },
      { status: 400 }
    );
  }

  // Forced-attribution gate: if the upload matched an existing work, that work
  // (or an ancestor of it) must be declared as parent before publishing.
  if (work.suspected_parent_work_id) {
    let attributed = work.parent_work_id === work.suspected_parent_work_id;
    if (!attributed && work.parent_work_id) {
      const chain = await worksService.getProvenanceChain(params.id);
      attributed = chain.some((w) => w.id === work.suspected_parent_work_id);
    }
    if (!attributed) {
      const { data: original } = await service
        .from("works")
        .select("id, title, owner_profile_id")
        .eq("id", work.suspected_parent_work_id)
        .single();
      return NextResponse.json(
        {
          error: "This work matches an existing one — declare it as a remix to publish.",
          match: original
            ? { workId: original.id, title: original.title }
            : { workId: work.suspected_parent_work_id },
        },
        { status: 409 }
      );
    }
  }

  await worksService.updateOriginality(params.id, { status: "ACTIVE" });
  return NextResponse.json({ status: "ACTIVE" });
}
