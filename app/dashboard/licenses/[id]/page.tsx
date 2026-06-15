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
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createLicenseService } from "@/app/services/license.service";
import { LicenseStatusCard } from "@/components/license-status-card";

const EXPLORER = "https://testnet.arcscan.app";

export default async function LicenseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const auth = createSupabaseServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return redirect("/sign-in");

  const { data: profile } = await auth
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  const service = createSupabaseServiceClient();
  const licenseService = createLicenseService(service);
  const license = await licenseService.getLicenseWithDetails(params.id);
  if (!license) return notFound();

  const work = license.work;
  const isBuyer = license.buyer_profile_id === profile?.id;
  const isOwner = work?.owner_profile_id === profile?.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold">
          License: {work?.title ?? "Work"}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {work && (
            <Link
              href={`/dashboard/works/${work.id}`}
              className="text-blue-500 hover:underline"
            >
              View work
            </Link>
          )}
          {license.onchain_job_id && (
            <span>ERC-8183 job #{license.onchain_job_id}</span>
          )}
          {license.job_tx_hash && (
            <a
              href={`${EXPLORER}/tx/${license.job_tx_hash}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 hover:underline"
            >
              View on Arcscan
            </a>
          )}
        </div>
      </div>

      <LicenseStatusCard
        initialLicense={license}
        isBuyer={isBuyer}
        isOwner={isOwner}
      />
    </div>
  );
}
