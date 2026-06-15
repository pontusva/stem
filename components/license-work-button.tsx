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
import { formatUsdc } from "@/lib/utils/royalty";

interface Props {
  workId: string;
  price: number;
  disabled?: boolean;
}

export function LicenseWorkButton({ workId, price, disabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLicense() {
    setLoading(true);
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start license");
      toast.success("Escrow job created on Arc");
      router.push(`/dashboard/licenses/${json.license.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to start license");
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleLicense} disabled={loading || disabled} className="w-full">
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Creating escrow job…
        </>
      ) : (
        `Buy a license · ${formatUsdc(price)}`
      )}
    </Button>
  );
}
