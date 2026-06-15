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

import {
  createPublicClient,
  http,
  decodeEventLog,
  parseAbiItem,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { sleep } from "@/lib/utils/sleep";

/**
 * Arc Testnet contract addresses and constants.
 * USDC is the native gas token on Arc; the ERC-20 USDC contract uses 6 decimals.
 */
export const ARC = {
  USDC: "0x3600000000000000000000000000000000000000",
  AGENTIC_COMMERCE: "0x0747EEf0706327138c69792bF28Cd525089e4583", // ERC-8183
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e", // ERC-8004
  REPUTATION_REGISTRY: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  VALIDATION_REGISTRY: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  EXPLORER: "https://testnet.arcscan.app",
  BLOCKCHAIN: "ARC-TESTNET",
} as const;

/** Read-only viem client for Arc Testnet (event decoding, contract reads). */
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// --------------------------------------------------------------------------
// USDC unit helpers (6 decimals — never use 18, that's native gas)
// --------------------------------------------------------------------------

/** Convert a human USDC amount to base units (6 decimals) as a string. */
export function toUsdcUnits(amount: number): string {
  return BigInt(Math.round(amount * 1_000_000)).toString();
}

/** Convert USDC base units (6 decimals) to a human amount. */
export function fromUsdcUnits(units: string | bigint): number {
  return Number(BigInt(units)) / 1_000_000;
}

// --------------------------------------------------------------------------
// Circle developer-controlled transaction polling
// --------------------------------------------------------------------------

export type CircleTxResult = {
  state: string;
  txHash?: string;
};

/**
 * Poll a Circle developer-controlled transaction until it reaches a terminal
 * state. Arc has sub-second finality, so this typically returns within a few
 * seconds. Throws on FAILED/DENIED/CANCELLED or timeout.
 */
export async function waitForCircleTx(
  transactionId: string,
  label = "transaction",
  { tries = 40, intervalMs = 2000 } = {}
): Promise<CircleTxResult> {
  for (let i = 0; i < tries; i++) {
    await sleep(intervalMs);
    const { data } = await circleDeveloperSdk.getTransaction({
      id: transactionId,
    });
    const state = data?.transaction?.state;

    if (state === "COMPLETE") {
      return { state, txHash: data?.transaction?.txHash };
    }
    if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
      throw new Error(`${label} ${state.toLowerCase()} on chain`);
    }
  }
  throw new Error(`${label} timed out waiting for confirmation`);
}

// --------------------------------------------------------------------------
// ERC-8183 AgenticCommerce — minimal ABI for the job lifecycle
// --------------------------------------------------------------------------

export const AGENTIC_COMMERCE_ABI = [
  {
    type: "event",
    name: "JobCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" },
      { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: false, name: "evaluator", type: "address" },
      { indexed: false, name: "expiredAt", type: "uint256" },
      { indexed: false, name: "hook", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "evaluator", type: "address" },
          { name: "description", type: "string" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "hook", type: "address" },
        ],
      },
    ],
  },
] as const;

export const ERC8183_STATUS_NAMES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
] as const;

/**
 * Extract the ERC-8183 jobId from a createJob transaction by decoding the
 * JobCreated event from the receipt logs.
 */
export async function getJobIdFromTxHash(txHash: string): Promise<string> {
  const receipt = await arcPublicClient.getTransactionReceipt({
    hash: txHash as Hex,
  });

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: AGENTIC_COMMERCE_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "JobCreated") {
        return (decoded.args as { jobId: bigint }).jobId.toString();
      }
    } catch {
      continue;
    }
  }
  throw new Error("Could not parse JobCreated event from transaction receipt");
}

// --------------------------------------------------------------------------
// ERC-8004 IdentityRegistry — extract minted agent id from a register() tx
// --------------------------------------------------------------------------

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

/**
 * Extract the ERC-8004 agent id (ERC-721 token id) minted to `ownerAddress`
 * from a register() transaction receipt.
 */
export async function getAgentIdFromTxHash(
  txHash: string,
  ownerAddress: string
): Promise<string | null> {
  const receipt = await arcPublicClient.getTransactionReceipt({
    hash: txHash as Hex,
  });

  const owner = ownerAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ARC.IDENTITY_REGISTRY.toLowerCase()) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as { to: string; tokenId: bigint };
      if (args.to.toLowerCase() === owner) {
        return args.tokenId.toString();
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Build an arcscan link for a tx hash. */
export function arcscanTx(txHash: string): string {
  return `${ARC.EXPLORER}/tx/${txHash}`;
}

/** Build an arcscan link for an address. */
export function arcscanAddress(address: string): string {
  return `${ARC.EXPLORER}/address/${address}`;
}
