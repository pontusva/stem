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

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AudioPlayer } from "@/components/audio-player";

/**
 * Plays a licensed work's audio from the private "stems" bucket via a
 * short-lived signed URL (authenticated callers only), refreshing it as it
 * nears expiry / on media errors. No metering — library playback isn't charged.
 */
export function LicensedAudio({ workId, title }: { workId: string; title?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const mintedAtRef = useRef(0);
  const ttlRef = useRef(60);
  const inFlightRef = useRef(false);
  const lastErrorRef = useRef(0);

  const fetchUrl = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/works/${workId}/audio-url`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.url) {
        mintedAtRef.current = Date.now();
        ttlRef.current = Number(json.expiresIn) || 60;
        setUrl(json.url);
      }
    } catch {
      // transient — play/error will retry
    } finally {
      inFlightRef.current = false;
    }
  }, [workId]);

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  const onPlayingChange = useCallback(
    (playing: boolean) => {
      if (!playing) return;
      const age = Date.now() - mintedAtRef.current;
      if (age > (ttlRef.current - 10) * 1000) fetchUrl();
    },
    [fetchUrl]
  );

  const onError = useCallback(() => {
    const now = Date.now();
    if (now - lastErrorRef.current < 3000) return;
    lastErrorRef.current = now;
    fetchUrl();
  }, [fetchUrl]);

  if (!url) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-2xl border-[1.5px] border-border bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--blue-deep)]" />
      </div>
    );
  }

  return (
    <AudioPlayer
      src={url}
      title={title}
      onPlayingChange={onPlayingChange}
      onError={onError}
    />
  );
}
