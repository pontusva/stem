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

/**
 * Moderator allowlist. Set ADMIN_PROFILE_IDS to a comma-separated list of
 * profile ids that may resolve plagiarism reports and take works down.
 * Server-only — never expose this to the client.
 */
export function adminProfileIds(): string[] {
  return (process.env.ADMIN_PROFILE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminProfile(profileId: string | null | undefined): boolean {
  if (!profileId) return false;
  return adminProfileIds().includes(profileId);
}
