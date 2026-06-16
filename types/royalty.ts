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

export type WorkType = "music" | "art" | "writing";

export type ContributorType = "human" | "ai";

export type LicenseStatus =
  | "INITIATED"
  | "JOB_CREATED"
  | "BUDGETED"
  | "APPROVED"
  | "FUNDED"
  | "SUBMITTED"
  | "COMPLETED"
  | "SPLITTING"
  | "CLOSED"
  | "REFUNDED"
  | "REJECTED"
  | "FAILED";

export type RoyaltyPaymentStatus = "PENDING" | "COMPLETE" | "FAILED";

export type ValidationVerdict = "PASS" | "FAIL";
export type ValidationStatus = "PENDING" | "COMPLETE" | "FAILED";
export type EvidenceKind = "text" | "image" | "metadata";

export interface Work {
  id: string;
  owner_profile_id: string;
  title: string;
  description: string | null;
  work_type: WorkType;
  file_path: string | null;
  file_url: string | null;
  duration_seconds: number | null;
  parent_work_id: string | null;
  license_price: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Contributor {
  id: string;
  work_id: string;
  profile_id: string | null;
  wallet_id: string;
  contributor_type: ContributorType;
  display_name: string;
  split_pct: number;
  erc8004_agent_id: string | null;
  erc8004_tx_hash: string | null;
  created_at: string;
}

/** A contributor joined with the wallet address it pays out to. */
export interface ContributorWithWallet extends Contributor {
  wallet: { id: string; wallet_address: string; circle_wallet_id: string } | null;
}

export interface License {
  id: string;
  work_id: string;
  buyer_profile_id: string;
  buyer_wallet_id: string;
  amount_usdc: number;
  onchain_job_id: string | null;
  job_tx_hash: string | null;
  status: LicenseStatus;
  created_at: string;
  updated_at: string;
}

export interface RoyaltyPayment {
  id: string;
  license_id: string;
  contributor_id: string;
  wallet_id: string;
  amount_usdc: number;
  split_pct: number;
  circle_transfer_id: string | null;
  status: RoyaltyPaymentStatus;
  created_at: string;
}

export interface WorkWithContributors extends Work {
  contributors: ContributorWithWallet[];
  parent_work?: Work | null;
  /** completed licenses (sales) of this work */
  licenses_count?: number;
  /** total USDC royalties paid out for this work */
  earned?: number;
}

export interface RoyaltyPaymentWithContributor extends RoyaltyPayment {
  contributor: Pick<Contributor, "display_name" | "contributor_type"> | null;
}

export interface LicenseWithDetails extends License {
  work: Work | null;
  royalty_payments: RoyaltyPaymentWithContributor[];
}

/** A reusable AI agent (a wallet row with is_ai = true). */
export interface AiAgent {
  id: string; // wallet id
  display_name: string;
  origin: string | null;
  capabilities: string | null;
  wallet_address: string;
  circle_wallet_id: string;
  erc8004_agent_id: string | null;
  erc8004_tx_hash: string | null;
  created_at: string;
}

export interface AiAgentWithStats extends AiAgent {
  works_count: number;
  total_earned: number;
  /** number of COMPLETE paid validations this agent has performed */
  validations_count: number;
  /** total USDC earned in validation service fees (distinct from royalties) */
  fees_earned: number;
}

/** A paid AI work-validation event (one per license validation attempt). */
export interface Validation {
  id: string;
  license_id: string;
  work_id: string;
  validator_wallet_id: string;
  model: string;
  verdict: ValidationVerdict;
  confidence: number | null;
  reasoning: string | null;
  evidence_kind: EvidenceKind | null;
  fee_usdc: number;
  circle_transfer_id: string | null;
  status: ValidationStatus;
  onchain_tx_hash: string | null;
  created_at: string;
}

/** The validation outcome returned alongside a license purchase. */
export interface ValidationResult {
  verdict: ValidationVerdict;
  confidence: number;
  reasoning: string;
  evidenceKind: EvidenceKind;
  /** true when Claude was unreachable and we failed open (no fee charged) */
  failedOpen: boolean;
}

/** Shape of a contributor row submitted from the registration form. */
export interface ContributorInput {
  contributor_type: ContributorType;
  display_name: string;
  split_pct: number;
  /** For humans: an existing wallet_id. For AI: created via /api/ai-wallet first. */
  wallet_id: string;
  profile_id?: string | null;
  erc8004_agent_id?: string | null;
  erc8004_tx_hash?: string | null;
}
