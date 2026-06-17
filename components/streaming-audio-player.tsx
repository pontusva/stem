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
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Lock, LogIn, Wallet } from "lucide-react";
import { AudioPlayer } from "@/components/audio-player";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/utils/royalty";
import { STREAM_RATE_USDC_PER_MINUTE } from "@/lib/utils/streaming";

const TOPUP_AMOUNT = 1; // USDC per top-up tap

interface Props {
  workId: string;
  title?: string;
  /** Owner, contributor, or license holder — listens free, no meter. */
  free?: boolean;
  /** Why listening is free, for the right note copy. */
  freeReason?: "creator" | "licensed";
  signedIn?: boolean;
}

/**
 * Pay-per-listen wrapper around AudioPlayer (Mode 1, internal pocket).
 *
 * Audio bytes live in a private bucket and are streamed through the same-origin
 * proxy /api/works/[id]/audio (cookie-authenticated) — no Supabase signed URL is
 * ever exposed to the browser. Signed-out users never get an audio element at
 * all; they see a locked sign-in card.
 *
 * For signed-in listeners it meters real listening and charges $0.001/min via
 * /api/works/[id]/stream, pausing with a top-up prompt when the pocket runs dry
 * (the proxy also refuses bytes once the pocket is empty, returning 402).
 */
export function StreamingAudioPlayer({
  workId,
  title,
  free,
  freeReason = "creator",
  signedIn,
}: Props) {
  const [pocketBalance, setPocketBalance] = useState(0);
  const [paidThisSession, setPaidThisSession] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);

  const secondsRef = useRef(0);
  const chargedMinuteRef = useRef(0);
  const inFlightRef = useRef(false);
  const blockedRef = useRef(false);
  const lastErrorRef = useRef(0);

  const meter = !free && !!signedIn; // owner/contributor & signed-out never metered

  // Same-origin proxy: a stable, cookie-authenticated URL — no minting/rotation,
  // and nothing copyable that works without this user's session.
  const audioSrc = `/api/works/${workId}/audio`;

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  // Load the listener's current pocket balance up front.
  useEffect(() => {
    if (!meter) return;
    let cancelled = false;
    fetch("/api/pocket")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setPocketBalance(Number(j.balance) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meter]);

  const heartbeat = useCallback(
    async (end: boolean) => {
      if (inFlightRef.current && !end) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/works/${workId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secondsPlayed: Math.floor(secondsRef.current),
            end,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (!end) toast.error(json.error || "Streaming charge failed");
          return;
        }
        setPocketBalance(Number(json.pocketBalance) || 0);
        setPaidThisSession(Number(json.amountCharged) || 0);
        chargedMinuteRef.current = Number(json.minutesCharged) || 0;
        if (json.paused) {
          setBlocked(true);
          toast.info("Your pocket's empty — top up to keep listening 🫧");
        }
      } catch {
        // network hiccup — next minute retries
      } finally {
        inFlightRef.current = false;
      }
    },
    [workId]
  );

  // Cumulative listened seconds → charge each newly-completed minute (first 60s free).
  const handleSeconds = useCallback(
    (seconds: number) => {
      secondsRef.current = seconds;
      if (free) return; // owner / contributor listen free
      const minute = Math.floor(seconds / 60);
      if (minute > chargedMinuteRef.current && !inFlightRef.current && !blockedRef.current) {
        heartbeat(false);
      }
    },
    [free, heartbeat]
  );

  const handlePlayingChange = useCallback(
    (playing: boolean) => {
      if (playing) return;
      // Paused — settle completed minutes (paying listeners only).
      if (meter) heartbeat(false);
    },
    [meter, heartbeat]
  );

  // A media error for a metered listener means the proxy stopped serving bytes
  // (pocket empty → 402). Settle via the heartbeat so the empty-pocket state and
  // the top-up prompt surface; a short cooldown guards against error loops.
  const handleAudioError = useCallback(() => {
    if (!meter) return;
    const now = Date.now();
    if (now - lastErrorRef.current < 3000) return;
    lastErrorRef.current = now;
    setBlocked(true);
    heartbeat(false);
  }, [meter, heartbeat]);

  // Final settle on navigation away / unmount (paying listeners only).
  useEffect(() => {
    if (!meter) return;
    function flush() {
      const body = JSON.stringify({
        secondsPlayed: Math.floor(secondsRef.current),
        end: true,
      });
      navigator.sendBeacon?.(
        `/api/works/${workId}/stream`,
        new Blob([body], { type: "application/json" })
      );
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [meter, workId]);

  async function topUp() {
    setToppingUp(true);
    try {
      const res = await fetch("/api/pocket/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: TOPUP_AMOUNT }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Top-up failed");
      setPocketBalance(Number(json.balance) || 0);
      setBlocked(false);
      toast.success(`Topped up ${formatUsdc(TOPUP_AMOUNT)} — keep listening!`);
    } catch (err: any) {
      toast.error(err.message || "Top-up failed");
    } finally {
      setToppingUp(false);
    }
  }

  // Signed-out: no signed URL, no audio element — a hard sign-in wall.
  if (!signedIn) {
    return (
      <div className="space-y-2 rounded-2xl border-[1.5px] border-border bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-5 text-center shadow-[var(--shadow-cloud-sm)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/70">
          <Lock className="h-5 w-5 text-[var(--blue-deep)]" />
        </div>
        <p className="text-sm font-extrabold">sign in to listen 🎵</p>
        <p className="text-xs font-semibold text-muted-foreground">
          this stem streams for supporters — {formatUsdc(STREAM_RATE_USDC_PER_MINUTE, 6)}/min.
        </p>
        <Button asChild className="mt-1">
          <Link href="/sign-in">
            <LogIn className="h-4 w-4" /> sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AudioPlayer
        src={audioSrc}
        title={title}
        onSecondsPlayed={handleSeconds}
        onPlayingChange={handlePlayingChange}
        onError={handleAudioError}
        blocked={blocked}
      />

      {free ? (
        <p className="rounded-2xl bg-secondary/30 p-3 text-xs font-bold text-secondary-foreground">
          {freeReason === "licensed"
            ? "✿ you own a license for this stem — listen all you like, no charge."
            : "✿ you're a creator on this stem — listening's on us."}
        </p>
      ) : (
        <div className="rounded-2xl border-[1.5px] border-border bg-card/70 p-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>🎧 pay-per-listen · {formatUsdc(STREAM_RATE_USDC_PER_MINUTE, 6)}/min</span>
            <span>paid this session: {formatUsdc(paidThisSession, 6)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold">
              pocket: <span className="text-[var(--blue-deep)]">{formatUsdc(pocketBalance, 4)}</span>
            </span>
            <Button size="sm" onClick={topUp} disabled={toppingUp} variant={blocked ? "default" : "outline"}>
              {toppingUp ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> topping up…
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" /> top up {formatUsdc(TOPUP_AMOUNT)}
                </>
              )}
            </Button>
          </div>
          {blocked && (
            <p className="mt-2 rounded-xl bg-accent/40 p-2 text-xs font-bold text-accent-foreground">
              pocket empty — top up to keep the music going 🫧
            </p>
          )}
        </div>
      )}
    </div>
  );
}
