/**
 * One-time helper: register your Circle entity secret against your CIRCLE_API_KEY
 * and save the recovery file.
 *
 * - If CIRCLE_ENTITY_SECRET is already in .env.local (a 64-char hex string), it
 *   registers THAT one (so your existing value keeps working).
 * - If it's missing, it generates a fresh one and prints it to paste in.
 *
 * Prereq: CIRCLE_API_KEY must be in .env.local.
 * Run:    node register-entity-secret.mjs
 */

import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import {
  generateEntitySecret,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

config({ path: ".env.local" });

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error(
    "✗ CIRCLE_API_KEY is not set in .env.local.\n" +
      "  Get one at https://console.circle.com/apikeys (TESTNET → Standard key)."
  );
  process.exit(1);
}

const existing = (process.env.CIRCLE_ENTITY_SECRET || "").trim();
const isValidHex = /^[0-9a-fA-F]{64}$/.test(existing);

// Reuse the secret already in .env.local when it's valid; otherwise generate one.
const entitySecret = isValidHex ? existing : generateEntitySecret();

try {
  const response = await registerEntitySecretCiphertext({ apiKey, entitySecret });

  const recoveryFile = response.data?.recoveryFile;
  if (recoveryFile) {
    const path = "circle-entity-secret-recovery.dat";
    writeFileSync(path, recoveryFile, "utf8");
    console.log(`✓ Recovery file written to ${path} — store it somewhere safe.`);
  }

  if (isValidHex) {
    console.log("\n✓ Registered the entity secret already in .env.local. Nothing else to paste.");
  } else {
    console.log("\n✓ Entity secret generated + registered. Add this to .env.local:\n");
    console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}\n`);
  }
  console.log("Next:  npm run generate-wallet");
} catch (error) {
  const data = error?.response?.data;
  if (data?.code === 156015 || /already.*set/i.test(data?.message ?? "")) {
    console.error(
      "✗ An entity secret is already registered for this API key, and it isn't\n" +
        "  the one in .env.local. Either paste the originally-registered secret into\n" +
        "  .env.local, or rotate it in the Circle console, then re-run."
    );
  } else {
    console.error("✗ Registration failed:", data ? JSON.stringify(data) : error?.message);
  }
  process.exit(1);
}
