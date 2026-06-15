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

import { StemCloud } from "@/components/kawaii/stem-cloud";

interface Props {
  title: string;
  hint?: string;
}

/** A sad-but-cute StemCloud empty state. */
export function EmptyState({ title, hint }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] border-[1.5px] border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <StemCloud size={96} mood="sad" notes={false} />
      <p className="text-base font-bold text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
