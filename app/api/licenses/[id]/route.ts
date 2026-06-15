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

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { createLicenseService } from "@/app/services/license.service";

// Live escrow status — never cache this response.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/licenses/[id] — license with work + royalty payment breakdown. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const service = createSupabaseServiceClient();
    const licenseService = createLicenseService(service);

    // Settle any in-flight royalty transfers (webhook can't reach localhost).
    await licenseService.reconcilePendingPayments(params.id);

    const license = await licenseService.getLicenseWithDetails(params.id);
    if (!license) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }
    return NextResponse.json({ license });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to fetch license: ${error.message}` },
      { status: 500 }
    );
  }
}
