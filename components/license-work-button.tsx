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
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatUsdc } from "@/lib/utils/royalty";

interface Props {
  workId: string;
  price: number;
  disabled?: boolean;
}

/**
 * Buy a derivative license with an instant, direct split payment. A confirm
 * dialog precedes the charge; on success the buyer's pocket pays every
 * contributor and the license is granted (download + remix unlock).
 */
export function LicenseWorkButton({ workId, price, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function buy() {
    setLoading(true);
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Purchase failed");
      toast.success("License granted — download & remix unlocked! ✨");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} className="w-full">
          Buy license · {formatUsdc(price)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buy this license for {formatUsdc(price)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Your {formatUsdc(price)} is paid instantly from your pocket and split to
            every contributor (human &amp; AI) by their share. You&apos;ll unlock download
            and remix rights right away — no escrow, no waiting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <Button onClick={buy} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> paying contributors…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Confirm &amp; pay {formatUsdc(price)}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
