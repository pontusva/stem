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
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Owner-facing share action: copies the current work URL so other people can
 * open it and license (buy) the work.
 */
export function ShareWorkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Link copied — share it so others can license your work ✨");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-4 text-center">
      <p className="text-sm font-extrabold">✨ this is your work</p>
      <p className="text-xs font-semibold text-muted-foreground">
        share the link — anyone signed in can license it, and the USDC floats
        straight to your contributors.
      </p>
      <Button onClick={copy} className="w-full">
        {copied ? (
          <>
            <Check className="h-4 w-4" /> copied!
          </>
        ) : (
          <>
            <Link2 className="h-4 w-4" /> copy share link
          </>
        )}
      </Button>
    </div>
  );
}
