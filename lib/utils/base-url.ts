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

/** Ensure an absolute, protocol-prefixed URL with no trailing slash. */
function normalize(url: string): string {
  const withProtocol = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/+$/, "");
}

/**
 * Resolve the app's base URL for the current environment, in priority order:
 *
 *   1. NEXT_PUBLIC_VERCEL_URL — explicit override you set in Vercel (full URL).
 *      Leave it blank locally so we fall through to localhost.
 *   2. VERCEL_URL — auto-injected by Vercel as a bare host (no protocol),
 *      server-side only. We prepend https://. This is the per-deployment URL,
 *      so prefer #1 (a stable custom/production domain) for anything user-facing.
 *   3. http://localhost:3000 — local development default.
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return normalize(process.env.NEXT_PUBLIC_VERCEL_URL);
  }
  if (process.env.VERCEL_URL) {
    return normalize(process.env.VERCEL_URL);
  }
  return "http://localhost:3000";
}
