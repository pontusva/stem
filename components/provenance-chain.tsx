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
import { ChevronRight } from "lucide-react";
import { Work } from "@/types/royalty";

/**
 * Renders the provenance chain oldest-first: root → ... → parent → [this work].
 */
export function ProvenanceChain({
  chain,
  current,
}: {
  chain: Work[];
  current: Work;
}) {
  if (!chain.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      {chain.map((w) => (
        <span key={w.id} className="flex items-center gap-1">
          <Link
            href={`/works/${w.id}`}
            className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            {w.title}
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </span>
      ))}
      <span className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 font-medium text-blue-500">
        {current.title}
      </span>
    </div>
  );
}
