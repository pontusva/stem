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

import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client for AI work validation. Reads ANTHROPIC_API_KEY from the
 * environment. Used to validate that a delivered creative work is genuine
 * before royalties are released.
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60_000,
});

/** Default validation model. Swap for claude-sonnet-4-6 / claude-haiku-4-5 to trade cost for capability. */
export const VALIDATION_MODEL = "claude-opus-4-8";
