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

/** KawaiiWallet — a chubby wallet with blush marks and little stars. */
export function KawaiiWallet({ size = 56, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      role="img"
      aria-label="wallet"
    >
      {/* body */}
      <rect x="8" y="16" width="56" height="40" rx="13" fill="#B8D4F0" />
      <rect x="8" y="16" width="56" height="40" rx="13" fill="url(#wgrad)" />
      {/* flap */}
      <path d="M8 27 Q8 16 21 16 H58 Q50 27 50 27 Z" fill="#A7CDF5" opacity="0.6" />
      {/* clasp / coin pocket */}
      <rect x="44" y="30" width="24" height="14" rx="7" fill="#fff" />
      <circle cx="56" cy="37" r="4.2" fill="#E8D6FA" />
      <circle cx="56" cy="37" r="1.6" fill="#C9A9F5" />
      {/* blush */}
      <ellipse cx="22" cy="42" rx="4.5" ry="3" fill="#FAD6E8" />
      <ellipse cx="38" cy="42" rx="4.5" ry="3" fill="#FAD6E8" />
      {/* eyes + smile */}
      <circle cx="24" cy="37" r="2.4" fill="#4A5578" />
      <circle cx="36" cy="37" r="2.4" fill="#4A5578" />
      <path d="M26 41 q4 3 8 0" stroke="#4A5578" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* stars */}
      <path d="M14 10 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#F5D76E" className="animate-twinkle" style={{ transformOrigin: "14px 13px" }} />
      <path d="M62 8 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 Z" fill="#F5A9C9" />
      <defs>
        <linearGradient id="wgrad" x1="8" y1="16" x2="64" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C7DEF7" />
          <stop offset="1" stopColor="#A7CDF5" />
        </linearGradient>
      </defs>
    </svg>
  );
}
