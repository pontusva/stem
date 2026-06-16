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
 * Compute USDC payout amounts (6-decimal precision) for a set of splits.
 *
 * Works entirely in integer base units to avoid floating point drift, then
 * assigns any rounding remainder ("dust") to the contributor with the largest
 * split so the payouts sum exactly to the total escrow amount.
 *
 * @param totalUsdc total amount being split, in human USDC (e.g. 100.5)
 * @param splits    array with a percentage for each recipient (must sum to ~100)
 * @returns per-recipient amounts in human USDC, index-aligned with `splits`
 */
export function computeSplitAmounts<T extends { split_pct: number | string }>(
  totalUsdc: number,
  splits: T[]
): number[] {
  if (splits.length === 0) return [];

  const totalUnits = BigInt(Math.round(totalUsdc * 1_000_000));

  const amounts: bigint[] = splits.map((s) => {
    const pct = typeof s.split_pct === "string" ? parseFloat(s.split_pct) : s.split_pct;
    // pct has up to 2 decimals -> use basis points (pct * 100) to stay integer
    const bps = BigInt(Math.round(pct * 100)); // e.g. 33.33% -> 3333
    return (totalUnits * bps) / 10_000n;
  });

  // Assign leftover dust to the largest-split recipient.
  const assigned = amounts.reduce((acc, a) => acc + a, 0n);
  const remainder = totalUnits - assigned;
  if (remainder !== 0n) {
    let maxIdx = 0;
    let maxPct = -Infinity;
    splits.forEach((s, i) => {
      const pct = typeof s.split_pct === "string" ? parseFloat(s.split_pct) : s.split_pct;
      if (pct > maxPct) {
        maxPct = pct;
        maxIdx = i;
      }
    });
    amounts[maxIdx] += remainder;
  }

  return amounts.map((a) => Number(a) / 1_000_000);
}

/**
 * stem's provenance rule: when a work is a remix/derivative, this fixed share of
 * every license flows back up to the parent work's creators (recursively).
 */
export const UPSTREAM_SHARE_PCT = 20;

/** Smallest split percentage the DB can store (NUMERIC(5,2), and must be > 0). */
const MIN_SPLIT_PCT = 0.01;

/**
 * Scale a parent work's contributor splits down to the upstream share, so they
 * can be added as locked contributors on the derivative. Rounds to 2 decimals.
 *
 * Deep provenance chains dilute each ancestor ~5× per level; once a share rounds
 * below the storable minimum it is dropped (returned as 0 — the caller skips it)
 * and its sliver is given to the nearest still-significant creator, so the kept
 * entries always sum to exactly `share` and no 0% / sub-minimum row is created.
 */
export function scaleUpstreamSplits(
  parentSplits: { split_pct: number | string }[],
  share = UPSTREAM_SHARE_PCT
): number[] {
  if (parentSplits.length === 0) return [];
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Drop ancestors that dilute below the storable minimum (they'd earn dust).
  const scaled = parentSplits.map((p) => {
    const pct = typeof p.split_pct === "string" ? parseFloat(p.split_pct) : p.split_pct;
    const v = round2((pct * share) / 100);
    return v < MIN_SPLIT_PCT ? 0 : v;
  });

  // Give the rounding/dropped remainder to the largest surviving contributor so
  // the kept rows sum to exactly `share`.
  const sum = scaled.reduce((a, b) => a + b, 0);
  const diff = round2(share - sum);
  if (diff !== 0) {
    let maxIdx = -1;
    scaled.forEach((v, i) => {
      if (v > 0 && (maxIdx < 0 || v > scaled[maxIdx])) maxIdx = i;
    });
    if (maxIdx >= 0) scaled[maxIdx] = round2(scaled[maxIdx] + diff);
  }
  return scaled; // entries equal to 0 must be skipped by the caller
}

/** Sum of split percentages, validated to equal 100 (within a small epsilon). */
export function splitsAreValid(
  splits: { split_pct: number | string }[]
): { valid: boolean; total: number } {
  const total = splits.reduce((acc, s) => {
    const pct = typeof s.split_pct === "string" ? parseFloat(s.split_pct) : s.split_pct;
    return acc + (Number.isFinite(pct) ? pct : 0);
  }, 0);
  return { valid: Math.abs(total - 100) < 0.01 && splits.length > 0, total };
}

/**
 * Format a USDC amount for display. `decimals` fixes the number of fraction
 * digits shown (USDC stores 6). Use the right precision for the context:
 *   - 2 → license / escrow / wallet-transaction amounts (the larger numbers)
 *   - 4 → earnings & pocket balances (e.g. "$0.0010")
 *   - 6 → the streaming meter, so a $0.001/min charge or $0.000300 split is visible
 *
 * The amount is TRUNCATED (toward zero) to `decimals`, never rounded up, so a
 * balance is never shown as more than it actually is (e.g. $40.005 → "$40.00",
 * not "$40.01"). Truncation is done in integer micro-USDC to dodge float error.
 */
export function formatUsdc(amount: number | string, decimals = 2): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const value = Number.isFinite(n) ? n : 0;

  // Snap to USDC's 6-dp base units, then truncate to the displayed precision.
  const micros = Math.round(value * 1_000_000);
  const perUnit = decimals >= 6 ? 1 : 10 ** (6 - decimals);
  const truncated = (Math.trunc(micros / perUnit) * perUnit) / 1_000_000;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(truncated);
}
