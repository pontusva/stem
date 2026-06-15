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

interface StemCloudProps {
  size?: number;
  mood?: "happy" | "sad";
  className?: string;
  /** floaty bob animation */
  float?: boolean;
  /** show the little musical notes orbiting the cloud */
  notes?: boolean;
}

/**
 * StemCloud — the stem mascot. A fluffy cloud wearing headphones with rosy
 * cheeks and a (•‿•) smile, musical notes drifting around it. The `sad` mood
 * adds a single tear for empty states (but stays cute).
 */
export function StemCloud({
  size = 120,
  mood = "happy",
  className,
  float = false,
  notes = true,
}: StemCloudProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(float && "animate-floaty", className)}
      role="img"
      aria-label="StemCloud mascot"
    >
      {/* floating musical notes */}
      {notes && (
        <g className="animate-twinkle" style={{ transformOrigin: "center" }}>
          <g fill="#C9A9F5">
            <circle cx="20" cy="44" r="4" />
            <rect x="23" y="28" width="2.6" height="18" rx="1.3" />
            <path d="M23 28 q9 -2 9 5 q-5 -3 -9 0 Z" />
          </g>
          <g fill="#F5A9C9">
            <circle cx="116" cy="38" r="3.4" />
            <rect x="118.4" y="24" width="2.2" height="15" rx="1.1" />
            <path d="M118.4 24 q7 -1.6 7 4 q-4 -2.4 -7 0 Z" />
          </g>
          <circle cx="124" cy="70" r="3" fill="#A7CDF5" />
        </g>
      )}

      {/* headphone band */}
      <path
        d="M30 64 Q30 18 70 18 Q110 18 110 64"
        stroke="#B8A6E8"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* fluffy cloud body */}
      <g filter="url(#cloudSoft)">
        <path
          d="M46 58
             a20 20 0 0 1 5 -39
             a22 22 0 0 1 39 -3
             a19 19 0 0 1 16 22
             a17 17 0 0 1 -7 33
             H50
             a18 18 0 0 1 -4 -13 Z"
          fill="#FFFFFF"
          stroke="#DCE8F7"
          strokeWidth="2.5"
        />
      </g>

      {/* ear cups */}
      <rect x="22" y="52" width="20" height="28" rx="10" fill="#C9A9F5" />
      <rect x="26" y="56" width="12" height="20" rx="6" fill="#E8D6FA" />
      <rect x="98" y="52" width="20" height="28" rx="10" fill="#C9A9F5" />
      <rect x="102" y="56" width="12" height="20" rx="6" fill="#E8D6FA" />

      {/* rosy cheeks */}
      <ellipse cx="52" cy="62" rx="7" ry="5" fill="#FAD6E8" />
      <ellipse cx="88" cy="62" rx="7" ry="5" fill="#FAD6E8" />

      {/* eyes + mouth */}
      {mood === "happy" ? (
        <>
          <circle cx="60" cy="52" r="3.6" fill="#4A5578" />
          <circle cx="80" cy="52" r="3.6" fill="#4A5578" />
          <circle cx="61.2" cy="50.8" r="1.1" fill="#fff" />
          <circle cx="81.2" cy="50.8" r="1.1" fill="#fff" />
          <path
            d="M64 60 Q70 66 76 60"
            stroke="#4A5578"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          {/* gentle droopy eyes */}
          <path d="M56 53 Q60 50 64 53" stroke="#4A5578" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M76 53 Q80 50 84 53" stroke="#4A5578" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M64 63 Q70 59 76 63" stroke="#4A5578" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          {/* a single cute tear */}
          <path d="M59 57 q-3 6 0 9 q3 -3 0 -9 Z" fill="#A7CDF5" />
        </>
      )}

      <defs>
        <filter id="cloudSoft" x="0" y="0" width="140" height="130" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#B8D4F0" floodOpacity="0.45" />
        </filter>
      </defs>
    </svg>
  );
}
