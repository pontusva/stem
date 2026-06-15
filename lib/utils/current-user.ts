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

import { SupabaseClient } from "@supabase/supabase-js";

export interface CurrentUser {
  authUserId: string;
  profileId: string;
  wallet: {
    id: string;
    circle_wallet_id: string;
    wallet_address: string;
  } | null;
}

/**
 * Resolve the authenticated caller's profile id and primary wallet from a
 * cookie-bound Supabase client. Returns null when not signed in.
 */
export async function getCurrentUser(
  supabase: SupabaseClient
): Promise<CurrentUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return null;

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, circle_wallet_id, wallet_address")
    .eq("profile_id", profile.id)
    .single();

  return {
    authUserId: user.id,
    profileId: profile.id,
    wallet: wallet ?? null,
  };
}
