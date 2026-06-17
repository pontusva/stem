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
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Uphold (→ takedown) or dismiss the open reports against a work. */
export function ReportModeration({ workId }: { workId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"uphold" | "dismiss" | null>(null);

  async function resolve(action: "uphold" | "dismiss") {
    setBusy(action);
    try {
      const res = await fetch(`/api/works/${workId}/takedown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not resolve report");
      toast.success(action === "uphold" ? "Work taken down." : "Report dismissed.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Could not resolve report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="destructive"
        onClick={() => resolve("uphold")}
        disabled={busy !== null}
      >
        {busy === "uphold" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Take down"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => resolve("dismiss")}
        disabled={busy !== null}
      >
        {busy === "dismiss" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dismiss"}
      </Button>
    </div>
  );
}
