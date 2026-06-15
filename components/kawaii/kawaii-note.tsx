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
  color?: string;
}

/** KawaiiNote — a music note with a cute face and a sparkle. */
export function KawaiiNote({ size = 48, className, color = "#A7CDF5" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      role="img"
      aria-label="music note"
    >
      <rect x="34" y="14" width="5" height="30" rx="2.5" fill={color} />
      <path d="M34 14 q16 -3 16 9 q-8 -5 -16 0 Z" fill={color} />
      <ellipse cx="24" cy="44" rx="13" ry="11" fill={color} />
      {/* face */}
      <circle cx="20" cy="43" r="2.2" fill="#fff" />
      <circle cx="29" cy="43" r="2.2" fill="#fff" />
      <path d="M21 48 q3 3 6 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="16" cy="47" rx="3" ry="2" fill="#FAD6E8" opacity="0.85" />
      <ellipse cx="32" cy="47" rx="3" ry="2" fill="#FAD6E8" opacity="0.85" />
      {/* sparkle */}
      <path
        d="M50 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"
        fill="#F5D76E"
        className="animate-twinkle"
        style={{ transformOrigin: "50px 35px" }}
      />
    </svg>
  );
}
