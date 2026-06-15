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
import { createSupabaseServerComponentClient } from "@/lib/supabase/server-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createWorksService } from "@/app/services/works.service";
import { WorksCatalog } from "@/components/works-catalog";
import { Button } from "@/components/ui/button";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  // Public — anyone can browse. Buying still needs an account.
  const auth = createSupabaseServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const service = createSupabaseServiceClient();
  const works = await createWorksService(service).listWorks();

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6] p-8">
        <SparkleDecoration count={8} />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-4">
            <StemCloud size={84} float />
            <div>
              <h1 className="text-4xl font-extrabold">explore stems ☁️</h1>
              <p className="max-w-lg font-semibold text-muted-foreground">
                Browse creative works by the community. License one and the USDC
                floats back to everyone who made it — humans &amp; AI.
              </p>
            </div>
          </div>
          {!user && (
            <div className="flex shrink-0 gap-2">
              <Button asChild variant="outline">
                <Link href="/sign-in">sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">join stem ✿</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <WorksCatalog works={works} />
    </div>
  );
}
