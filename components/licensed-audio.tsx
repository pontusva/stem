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

import { AudioPlayer } from "@/components/audio-player";

/**
 * Plays a licensed work's audio from the private "stems" bucket through the
 * same-origin proxy /api/works/[id]/audio (cookie-authenticated). No Supabase
 * signed URL is exposed, and there is no metering — library playback isn't charged.
 */
export function LicensedAudio({ workId, title }: { workId: string; title?: string }) {
  return <AudioPlayer src={`/api/works/${workId}/audio`} title={title} />;
}
