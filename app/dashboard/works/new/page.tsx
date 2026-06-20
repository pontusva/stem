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

import { redirect } from "next/navigation";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { RegisterWorkForm } from "@/components/register-work-form";

export default async function NewWorkPage({
  searchParams,
}: {
  searchParams: { parent?: string };
}) {
  const supabase = createSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, name")
    .eq("auth_user_id", user.id)
    .single();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("profile_id", profile?.id)
    .single();

  if (!wallet) {
    return (
      <p className="text-muted-foreground">
        Your account has no wallet yet. Please sign out and back in.
      </p>
    );
  }

  // Only published works can be remixed (named as a parent).
  const { data: works } = await supabase
    .from("works")
    .select("id, title")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  // Works this user has licensed (download + remix rights). We surface these as
  // suggested parents — the attribution nudge — since a remix that's transformed
  // enough to dodge fingerprinting still has a license paper trail.
  const { data: licenses } = await supabase
    .from("licenses")
    .select("work:works!licenses_work_id_fkey ( id, title, status )")
    .eq("buyer_profile_id", profile?.id ?? "")
    .not("status", "in", "(FAILED,REFUNDED,REJECTED)");
  const licensedWorks = Array.from(
    new Map(
      (licenses ?? [])
        .map((l: any) => l.work)
        .filter((w: any) => w && w.status === "ACTIVE")
        .map((w: any) => [w.id, { id: w.id, title: w.title }])
    ).values()
  );

  const ownerName = profile?.full_name || profile?.name || user.email || "You";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Register a work</h1>
      <RegisterWorkForm
        ownerName={ownerName}
        ownerWalletId={wallet.id}
        parentWorks={works ?? []}
        licensedWorks={licensedWorks}
        initialParentId={searchParams?.parent}
      />
    </div>
  );
}
