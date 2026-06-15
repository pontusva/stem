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
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createAiAgentService } from "@/app/services/ai-agent.service";
import { AiAgentCard } from "@/components/ai-agent-card";
import { CreateAiAgentDialog } from "@/components/create-ai-agent-dialog";
import { EmptyState } from "@/components/kawaii/empty-state";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";

export const dynamic = "force-dynamic";

export default async function AiAgentsPage() {
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

  const service = createAiAgentService(createSupabaseServiceClient());
  const agents = profile ? await service.listAgents(profile.id) : [];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF3FE] via-[#F3EDFE] to-[#FDEFF6] p-7">
        <SparkleDecoration count={7} />
        <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-4">
            <StemCloud size={72} float />
            <div>
              <h1 className="text-3xl font-extrabold">my AI agents 🤖</h1>
              <p className="font-semibold text-muted-foreground">
                Reusable little co-creators — each with its own wallet, onchain
                identity, and royalty history.
              </p>
            </div>
          </div>
          <CreateAiAgentDialog />
        </div>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          title="no AI agents yet…"
          hint="Summon your first AI co-creator — it gets a Circle wallet + ERC-8004 identity and can earn royalties on every work you add it to."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AiAgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
