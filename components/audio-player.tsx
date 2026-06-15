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

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BAR_COUNT = 48;

/** Deterministic pseudo-waveform heights derived from the src so the bars stay
 *  stable across renders without decoding the audio. Range ~0.25–1.0. */
function waveformBars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const n = ((h >>> 0) % 1000) / 1000; // 0–1
    bars.push(0.25 + n * 0.75);
  }
  return bars;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  src: string;
  title?: string;
  /** Reports cumulative seconds actually listened (used later for payment triggers). */
  onSecondsPlayed?: (seconds: number) => void;
}

/**
 * Kawaii streaming audio player. Streams over HTTP (preload="metadata", so the
 * file is fetched in ranges as it plays rather than downloaded up front) and
 * deliberately exposes no download affordance. A waveform-style bar doubles as
 * the seek control. Tracks seconds actually played in component state.
 */
export function AudioPlayer({ src, title, onSecondsPlayed }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Cumulative seconds the listener has actually heard — kept in state so a
  // future payment trigger can read it. Not the same as currentTime (seeks and
  // replays don't inflate it).
  const [secondsPlayed, setSecondsPlayed] = useState(0);

  const bars = useMemo(() => waveformBars(src), [src]);
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    onSecondsPlayed?.(secondsPlayed);
  }, [secondsPlayed, onSecondsPlayed]);

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    const delta = t - lastTimeRef.current;
    // Count only forward, real-time playback; ignore seeks/jumps (>1.5s gaps).
    if (delta > 0 && delta < 1.5) {
      setSecondsPlayed((prev) => prev + delta);
    }
    lastTimeRef.current = t;
    setCurrentTime(t);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }

  function seekTo(clientX: number, el: HTMLElement) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const target = ratio * duration;
    audio.currentTime = target;
    lastTimeRef.current = target; // don't count the jump as listening
    setCurrentTime(target);
  }

  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-4 shadow-[var(--shadow-cloud-sm)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--blue-deep)] text-white shadow-[var(--shadow-cloud-sm)] transition-transform hover:scale-105 active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {title && (
            <p className="mb-1.5 truncate text-xs font-extrabold text-[var(--lavender-deep)]">
              ♫ {title}
            </p>
          )}
          {/* Waveform-style progress + seek bar */}
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration)}
            aria-valuenow={Math.floor(currentTime)}
            tabIndex={0}
            onClick={(e) => seekTo(e.clientX, e.currentTarget)}
            onKeyDown={(e) => {
              const audio = audioRef.current;
              if (!audio || !duration) return;
              if (e.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 5);
              if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
            }}
            className="flex h-12 cursor-pointer items-center gap-[2px]"
          >
            {bars.map((height, i) => {
              const filled = i / BAR_COUNT <= progress;
              return (
                <span
                  key={i}
                  className="flex-1 rounded-full transition-colors"
                  style={{
                    height: `${Math.round(height * 100)}%`,
                    backgroundColor: filled
                      ? "var(--blue-deep)"
                      : "var(--border)",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
        <span>{fmt(currentTime)} / {fmt(duration)}</span>
        <span aria-live="off">🎧 listened {fmt(secondsPlayed)}</span>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          lastTimeRef.current = 0;
        }}
      />
    </div>
  );
}
