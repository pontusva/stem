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
  /** stable seed (e.g. the agent's wallet id) — drives the unique look */
  seed: string;
  size?: number;
  className?: string;
}

const HEADS: [string, string][] = [
  ["#EBDDFB", "#D9C2F5"], // lavender
  ["#DCEBFB", "#B9D7F5"], // baby blue
  ["#FBDDEB", "#F5C2DC"], // blush
  ["#DDF3E9", "#BFE9D4"], // mint
  ["#FBEFD9", "#F5DCB0"], // butter
  ["#E4E0FB", "#C7BEF5"], // periwinkle
];
const ANTENNAE = ["#F5A9C9", "#A7CDF5", "#C9A9F5", "#F5D76E", "#7FD7A8"];
const EYES = ["heart", "star", "dot", "sparkle"] as const;
const CHEEKS = ["#FAD6E8", "#FBE3CE", "#D9F0E4", "#E2DBFB"];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function Eyes({ kind, color }: { kind: string; color: string }) {
  const left = 21;
  const right = 35;
  if (kind === "heart") {
    return (
      <>
        {[left, right].map((x) => (
          <path
            key={x}
            d="M0 1.6 a1.8 1.8 0 0 1 3 0 a1.8 1.8 0 0 1 3 0 q0 2 -3 3.8 q-3 -1.8 -3 -3.8 Z"
            fill={color}
            transform={`translate(${x - 3} 25)`}
          />
        ))}
      </>
    );
  }
  if (kind === "star") {
    return (
      <>
        {[left, right].map((x) => (
          <path
            key={x}
            d="M0 -3 l0.9 2 2 0.6 -2 0.9 -0.9 2 -0.9 -2 -2 -0.9 2 -0.6 Z"
            fill={color}
            transform={`translate(${x} 28)`}
          />
        ))}
      </>
    );
  }
  if (kind === "sparkle") {
    return (
      <>
        {[left, right].map((x) => (
          <g key={x} transform={`translate(${x} 28)`}>
            <circle r="2.4" fill={color} />
            <circle cx="0.9" cy="-0.9" r="0.8" fill="#fff" />
          </g>
        ))}
      </>
    );
  }
  // dot
  return (
    <>
      {[left, right].map((x) => (
        <circle key={x} cx={x} cy={28} r="2.4" fill={color} />
      ))}
    </>
  );
}

/**
 * KawaiiAIAvatar — a robot face whose colours + eyes are deterministically
 * derived from a seed, so every AI agent has its own distinct little look.
 */
export function KawaiiAIAvatar({ seed, size = 64, className }: Props) {
  const h = hash(seed || "stem");
  const [c1, c2] = HEADS[h % HEADS.length];
  const antenna = ANTENNAE[(h >> 3) % ANTENNAE.length];
  const eyeKind = EYES[(h >> 5) % EYES.length];
  const cheek = CHEEKS[(h >> 7) % CHEEKS.length];
  const accent = "#8FBEF0";
  const gid = `aiv-${h.toString(36)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      role="img"
      aria-label="AI agent avatar"
    >
      <rect x="26.5" y="4" width="3" height="7" rx="1.5" fill={antenna} />
      <circle cx="28" cy="4" r="3.2" fill={antenna} />
      <rect x="9" y="11" width="38" height="34" rx="14" fill={`url(#${gid})`} />
      <rect x="15" y="18" width="26" height="21" rx="9" fill="#fff" />
      <Eyes kind={eyeKind} color={antenna} />
      <ellipse cx="18.5" cy="32" rx="2.6" ry="1.8" fill={cheek} />
      <ellipse cx="37.5" cy="32" rx="2.6" ry="1.8" fill={cheek} />
      <path d="M24 35 q4 3 8 0" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="4" y="24" width="6" height="9" rx="3" fill={c2} />
      <rect x="46" y="24" width="6" height="9" rx="3" fill={c2} />
      <defs>
        <linearGradient id={gid} x1="9" y1="11" x2="47" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
    </svg>
  );
}
