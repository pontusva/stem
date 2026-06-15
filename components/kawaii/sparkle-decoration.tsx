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
  className?: string;
  /** number of sparkles (cycles through a fixed layout) */
  count?: number;
}

// Deterministic layout (no Math.random — keeps SSR stable).
const STARS = [
  { top: "8%", left: "6%", s: 14, c: "#F5D76E", d: "0s" },
  { top: "18%", left: "88%", s: 10, c: "#F5A9C9", d: "0.6s" },
  { top: "42%", left: "12%", s: 9, c: "#A7CDF5", d: "1.1s" },
  { top: "70%", left: "82%", s: 13, c: "#C9A9F5", d: "0.3s" },
  { top: "84%", left: "20%", s: 11, c: "#F5D76E", d: "0.9s" },
  { top: "30%", left: "50%", s: 8, c: "#F5A9C9", d: "1.4s" },
  { top: "60%", left: "44%", s: 9, c: "#A7CDF5", d: "0.5s" },
  { top: "12%", left: "40%", s: 10, c: "#C9A9F5", d: "1.7s" },
  { top: "52%", left: "70%", s: 12, c: "#F5D76E", d: "0.2s" },
  { top: "90%", left: "60%", s: 9, c: "#A7CDF5", d: "1.0s" },
];

function Star({ s, c }: { s: number; c: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 0 l2.4 7.2 7.6 2.4 -7.6 2.4 -2.4 7.6 -2.4 -7.6 -7.6 -2.4 7.6 -2.4 Z"
        fill={c}
      />
    </svg>
  );
}

/**
 * SparkleDecoration — scattered twinkling stars for dreamy backgrounds.
 * Drop inside a `relative` container; it fills it and ignores pointer events.
 */
export function SparkleDecoration({ className, count = 10 }: Props) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {STARS.slice(0, count).map((star, i) => (
        <span
          key={i}
          className="absolute animate-twinkle"
          style={{
            top: star.top,
            left: star.left,
            animationDelay: star.d,
          }}
        >
          <Star s={star.s} c={star.c} />
        </span>
      ))}
    </div>
  );
}
