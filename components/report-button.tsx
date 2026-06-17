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
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Report a work as stolen / plagiarised. The human safety net behind automated
 * originality detection — admins review reports and take works down if upheld.
 */
export function ReportButton({ workId }: { workId: string }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/works/${workId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "PLAGIARISM", details }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not file report");
      toast.success("Thanks — we'll review this report.");
      setOpen(false);
      setDetails("");
    } catch (err: any) {
      toast.error(err.message || "Could not file report");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag className="h-4 w-4" /> report
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-[var(--shadow-cloud-sm)]">
        <h3 className="text-lg font-extrabold">Report this stem</h3>
        <p className="text-sm font-semibold text-muted-foreground">
          Think this was uploaded without rights or copied from another creator?
          Tell us what you know and we&apos;ll review it.
        </p>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="e.g. this is my track ‘…’, originally posted at …"
          className="w-full rounded-2xl border-[1.5px] border-border bg-input p-3 text-sm font-semibold focus-visible:border-[var(--blue-deep)] focus-visible:outline-none"
        />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit report"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
