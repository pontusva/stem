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

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUDIO_EXT = ["mp3", "wav", "ogg", "flac"];

/**
 * Download a licensed work's file. Audio lives in the private bucket, so we mint
 * a short-lived signed download URL; other file types use their public URL.
 */
export function DownloadButton({
  workId,
  fileUrl,
}: {
  workId: string;
  fileUrl: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
      let url = fileUrl;
      if (AUDIO_EXT.includes(ext)) {
        const res = await fetch(`/api/works/${workId}/audio-url?download=1`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not get download link");
        url = json.url;
      }
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      toast.error(err.message || "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={download} disabled={busy} variant="outline" className="w-full">
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> preparing…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" /> download
        </>
      )}
    </Button>
  );
}
