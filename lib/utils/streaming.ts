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
 * Streaming payments (Mode 1) — pay-per-listen pricing.
 * Listeners are charged this much USDC for every completed minute of audio,
 * split across the work's contributors.
 */
export const STREAM_RATE_USDC_PER_MINUTE = 0.001;

/** Completed minutes contained in a listened-seconds count (first charge at 60s). */
export function minutesFromSeconds(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

/** USDC cost for a number of minutes, rounded to 6-decimal USDC precision. */
export function costForMinutes(minutes: number): number {
  return Math.round(minutes * STREAM_RATE_USDC_PER_MINUTE * 1_000_000) / 1_000_000;
}
