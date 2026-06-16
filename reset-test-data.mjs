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

// Clears test data (works / licenses / royalties / streaming pockets /
// transactions) while keeping accounts + wallets. Calls the SECURITY DEFINER
// public.reset_test_data() function — create it once with
// supabase/reset-test-data.sql before running this.
//
//   npm run reset-test-data

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local"] });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const { error } = await supabase.rpc("reset_test_data");

if (error) {
  console.error(`✗ Reset failed: ${error.message}`);
  if (/function .*reset_test_data.* does not exist/i.test(error.message)) {
    console.error(
      "  → Run supabase/reset-test-data.sql once in the Supabase SQL editor to create the function."
    );
  }
  process.exit(1);
}

console.log(
  "✓ Test data cleared (works, licenses, royalties, streaming pockets, transactions)."
);
console.log("  Accounts & wallets kept — no need to re-register or re-fund.");
console.log("  (To also clear uploaded files, empty the 'stems' & 'works-files' buckets in Storage.)");
