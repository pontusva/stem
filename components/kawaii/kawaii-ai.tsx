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

import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
}

/** KawaiiAI — a little robot face with heart eyes, for AI contributors. */
export function KawaiiAI({ size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      role="img"
      aria-label="AI contributor"
    >
      {/* antenna */}
      <rect x="26.5" y="4" width="3" height="7" rx="1.5" fill="#C9A9F5" />
      <circle cx="28" cy="4" r="3" fill="#F5A9C9" />
      {/* head */}
      <rect x="9" y="11" width="38" height="34" rx="14" fill="#E8D6FA" />
      <rect x="9" y="11" width="38" height="34" rx="14" fill="url(#aigrad)" />
      {/* screen */}
      <rect x="15" y="18" width="26" height="21" rx="9" fill="#fff" />
      {/* heart eyes */}
      <path d="M22 26 a2.4 2.4 0 0 1 4 0 a2.4 2.4 0 0 1 4 0 q0 2.6 -4 5 q-4 -2.4 -4 -5 Z" fill="#F5A9C9" transform="translate(-3.5 -0.5)" />
      <path d="M22 26 a2.4 2.4 0 0 1 4 0 a2.4 2.4 0 0 1 4 0 q0 2.6 -4 5 q-4 -2.4 -4 -5 Z" fill="#F5A9C9" transform="translate(9.5 -0.5)" />
      {/* smile */}
      <path d="M24 35 q4 3 8 0" stroke="#8FBEF0" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* ear bolts */}
      <rect x="4" y="24" width="6" height="9" rx="3" fill="#C9A9F5" />
      <rect x="46" y="24" width="6" height="9" rx="3" fill="#C9A9F5" />
      <defs>
        <linearGradient id="aigrad" x1="9" y1="11" x2="47" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EBDDFB" />
          <stop offset="1" stopColor="#D9C2F5" />
        </linearGradient>
      </defs>
    </svg>
  );
}
