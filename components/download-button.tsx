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

"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUDIO_EXT = ["mp3", "wav", "ogg", "flac"];

/**
 * Download a licensed work's file. Audio lives in the private bucket and is
 * served through the same-origin proxy /api/works/[id]/audio?download=1, which
 * cookie-authenticates the caller, checks entitlement (owner/contributor/
 * licensee → 403 otherwise), and streams the bytes with an attachment
 * disposition. Other file types are served directly from their public URL.
 */
export function DownloadButton({
  workId,
  fileUrl,
}: {
  workId: string;
  fileUrl: string;
}) {
  const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
  const href = AUDIO_EXT.includes(ext)
    ? `/api/works/${workId}/audio?download=1`
    : fileUrl;

  return (
    <Button asChild variant="outline" className="w-full">
      <a href={href} download rel="noreferrer">
        <Download className="h-4 w-4" /> download
      </a>
    </Button>
  );
}
