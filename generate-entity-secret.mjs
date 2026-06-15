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
 * One-time bootstrap: register a Circle entity secret with your account and write
 * it into .env.local.
 *
 * Uses CIRCLE_ENTITY_SECRET from .env.local if set; otherwise generates a fresh
 * 32-byte secret. Registration is ONE-TIME PER CIRCLE ACCOUNT and returns a
 * recovery file (only available once) — keep it safe; it's how you recover wallets
 * if the entity secret is lost.
 */

import { config } from "dotenv";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import crypto from "crypto";
import fs from "fs";
import path from "path";

config({ path: [".env.local"] });

if (!process.env.CIRCLE_API_KEY) {
  console.error("Missing required environment variable: CIRCLE_API_KEY");
  process.exit(1);
}

// Reuse an existing secret (e.g. one already generated) or mint a fresh one.
const entitySecret =
  process.env.CIRCLE_ENTITY_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

try {
  const response = await registerEntitySecretCiphertext({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret,
  });

  // Recovery file is returned ONCE — persist it now.
  const recoveryFile = response.data?.recoveryFile;
  if (recoveryFile) {
    const recoveryPath = path.resolve("circle-entity-secret-recovery.dat");
    fs.writeFileSync(recoveryPath, recoveryFile);
    console.log(`Entity secret registered. Recovery file: ${recoveryPath}`);
    console.log("⚠️  Back up that recovery file somewhere safe (it's gitignored).");
  } else {
    console.log("Entity secret registered (no recovery file returned in response).");
  }

  // Persist the secret into .env.local.
  const envPath = path.resolve(".env.local");
  let envContent = fs.readFileSync(envPath, "utf-8");
  if (/^CIRCLE_ENTITY_SECRET=.*$/m.test(envContent)) {
    envContent = envContent.replace(
      /^CIRCLE_ENTITY_SECRET=.*$/m,
      `CIRCLE_ENTITY_SECRET=${entitySecret}`
    );
  } else {
    envContent += `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("CIRCLE_ENTITY_SECRET written to .env.local");
  console.log("Next: run `npm run generate-wallet`");
} catch (error) {
  const msg = error?.response?.data?.message || error.message || String(error);
  if (/already.*registered|entity secret.*exist/i.test(msg)) {
    console.error(
      "This Circle account already has a registered entity secret.\n" +
        "If it's the one in .env.local, you're set — run `npm run generate-wallet`.\n" +
        "Otherwise put the previously-registered secret in CIRCLE_ENTITY_SECRET.\n" +
        `(Circle said: ${msg})`
    );
  } else {
    console.error("Failed to register entity secret:", msg);
  }
  process.exit(1);
}
