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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Lets a work owner attach (or replace) the work file after registration —
 * the file is required before the work can be licensed.
 */
export function WorkFileUpload({ workId }: { workId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) return toast.error("Choose a file first");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/works/${workId}/file`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast.success("File uploaded — you can now license this work");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm text-muted-foreground">
        This work has no file yet. Upload one to enable licensing.
      </p>
      <Input
        type="file"
        accept="image/*,audio/*,application/pdf,text/plain"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button onClick={upload} disabled={uploading || !file} className="w-full">
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" /> Upload file
          </>
        )}
      </Button>
    </div>
  );
}
