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
import { Work, WorkType, WorkWithContributors } from "@/types/royalty";

const CONTRIBUTOR_SELECT = `
  *,
  wallet:wallets!contributors_wallet_id_fkey ( id, wallet_address, circle_wallet_id )
`;

export const createWorksService = (supabase: SupabaseClient) => ({
  async createWork(params: {
    ownerProfileId: string;
    title: string;
    description?: string | null;
    workType: WorkType;
    parentWorkId?: string | null;
    licensePrice?: number;
    filePath?: string | null;
    fileUrl?: string | null;
  }): Promise<Work> {
    const { data, error } = await supabase
      .from("works")
      .insert({
        owner_profile_id: params.ownerProfileId,
        title: params.title,
        description: params.description ?? null,
        work_type: params.workType,
        parent_work_id: params.parentWorkId ?? null,
        license_price: params.licensePrice ?? 0,
        file_path: params.filePath ?? null,
        file_url: params.fileUrl ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create work: ${error.message}`);
    return data as Work;
  },

  async updateWorkFile(
    workId: string,
    filePath: string,
    fileUrl: string
  ): Promise<void> {
    const { error } = await supabase
      .from("works")
      .update({ file_path: filePath, file_url: fileUrl })
      .eq("id", workId);
    if (error) throw new Error(`Failed to update work file: ${error.message}`);
  },

  async listWorks(): Promise<WorkWithContributors[]> {
    const { data, error } = await supabase
      .from("works")
      .select(`*, contributors:contributors!contributors_work_id_fkey ( ${CONTRIBUTOR_SELECT} )`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list works: ${error.message}`);
    const works = (data ?? []) as unknown as WorkWithContributors[];
    if (works.length === 0) return works;

    // Attach per-work stats: completed licenses (sales) + total royalties paid out.
    const workIds = works.map((w) => w.id);
    const { data: licenses } = await supabase
      .from("licenses")
      .select("id, work_id, status")
      .in("work_id", workIds);

    const licenseToWork = new Map<string, string>();
    const soldByWork = new Map<string, number>();
    (licenses ?? []).forEach((l: any) => {
      licenseToWork.set(l.id, l.work_id);
      if (l.status === "CLOSED") {
        soldByWork.set(l.work_id, (soldByWork.get(l.work_id) ?? 0) + 1);
      }
    });

    const licenseIds = (licenses ?? []).map((l: any) => l.id);
    let earnedByWork = new Map<string, number>();
    if (licenseIds.length) {
      const { data: payments } = await supabase
        .from("royalty_payments")
        .select("license_id, amount_usdc, status")
        .in("license_id", licenseIds)
        .eq("status", "COMPLETE");
      (payments ?? []).forEach((p: any) => {
        const wId = licenseToWork.get(p.license_id);
        if (wId) {
          earnedByWork.set(wId, (earnedByWork.get(wId) ?? 0) + Number(p.amount_usdc));
        }
      });
    }

    return works.map((w) => ({
      ...w,
      licenses_count: soldByWork.get(w.id) ?? 0,
      earned: earnedByWork.get(w.id) ?? 0,
    }));
  },

  async getWork(workId: string): Promise<WorkWithContributors | null> {
    const { data, error } = await supabase
      .from("works")
      .select(`*, contributors:contributors!contributors_work_id_fkey ( ${CONTRIBUTOR_SELECT} )`)
      .eq("id", workId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch work: ${error.message}`);
    }
    return data as unknown as WorkWithContributors;
  },

  /**
   * Walk the provenance chain upward from a work to its roots.
   * Returns [root, ..., parent] ordered oldest-first (excludes the work itself).
   */
  async getProvenanceChain(workId: string): Promise<Work[]> {
    const chain: Work[] = [];
    let cursor = workId;
    const seen = new Set<string>([workId]);

    // Bounded walk to avoid cycles.
    for (let i = 0; i < 25; i++) {
      const { data, error } = await supabase
        .from("works")
        .select("*")
        .eq("id", cursor)
        .single();
      if (error || !data) break;
      const parentId = (data as Work).parent_work_id;
      if (!parentId || seen.has(parentId)) break;
      const { data: parent } = await supabase
        .from("works")
        .select("*")
        .eq("id", parentId)
        .single();
      if (!parent) break;
      chain.unshift(parent as Work);
      seen.add(parentId);
      cursor = parentId;
    }
    return chain;
  },

  /**
   * Downstream lineage stats for a work: how many works descend from it (direct
   * + indirect remixes), and how much USDC its creators have earned from those
   * derivatives' licenses via the upstream provenance rule.
   */
  async getDownstreamStats(
    workId: string
  ): Promise<{ remixCount: number; downstreamEarned: number }> {
    // Build the child map and BFS the descendant set.
    const { data: allWorks } = await supabase
      .from("works")
      .select("id, parent_work_id");
    const childMap = new Map<string, string[]>();
    (allWorks ?? []).forEach((w: any) => {
      if (w.parent_work_id) {
        if (!childMap.has(w.parent_work_id)) childMap.set(w.parent_work_id, []);
        childMap.get(w.parent_work_id)!.push(w.id);
      }
    });

    const descendants = new Set<string>();
    const queue = [...(childMap.get(workId) ?? [])];
    while (queue.length) {
      const id = queue.shift()!;
      if (descendants.has(id)) continue;
      descendants.add(id);
      (childMap.get(id) ?? []).forEach((c) => queue.push(c));
    }
    if (descendants.size === 0) return { remixCount: 0, downstreamEarned: 0 };

    // This work's contributor wallets.
    const { data: contribs } = await supabase
      .from("contributors")
      .select("wallet_id")
      .eq("work_id", workId);
    const myWallets = new Set((contribs ?? []).map((c: any) => c.wallet_id));

    // Royalties paid to those wallets from descendant licenses.
    const { data: lics } = await supabase
      .from("licenses")
      .select("id")
      .in("work_id", Array.from(descendants));
    const licenseIds = (lics ?? []).map((l: any) => l.id);

    let downstreamEarned = 0;
    if (licenseIds.length && myWallets.size) {
      const { data: pays } = await supabase
        .from("royalty_payments")
        .select("wallet_id, amount_usdc, status")
        .in("license_id", licenseIds)
        .eq("status", "COMPLETE");
      (pays ?? []).forEach((p: any) => {
        if (myWallets.has(p.wallet_id)) downstreamEarned += Number(p.amount_usdc);
      });
    }

    return { remixCount: descendants.size, downstreamEarned };
  },
});
