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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/utils/royalty";

/**
 * Withdraw an AI agent's streaming pocket to the agent's OWN wallet. The human
 * who created the agent triggers it (the agent has no login), but the funds go
 * to the agent's address — so the agent holds what it earned.
 */
export function AgentWithdrawButton({
  agentId,
  balance,
}: {
  agentId: string;
  balance: number;
}) {
  const router = useRouter();
  const [withdrawing, setWithdrawing] = useState(false);

  async function withdraw() {
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/ai-agents/${agentId}/withdraw`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Withdrawal failed");
      toast.success(`Withdrew ${formatUsdc(json.amount, 6)} to the agent's wallet`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <Button
      onClick={withdraw}
      disabled={withdrawing || balance <= 0}
      size="sm"
      variant="outline"
      className="w-full"
    >
      {withdrawing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> withdrawing…
        </>
      ) : (
        <>
          <ArrowDownToLine className="h-4 w-4" /> withdraw to agent wallet
        </>
      )}
    </Button>
  );
}
