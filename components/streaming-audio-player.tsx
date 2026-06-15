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
import { Loader2, LogIn, Wallet } from "lucide-react";
import { AudioPlayer } from "@/components/audio-player";
import { Button } from "@/components/ui/button";
import { formatUsdc } from "@/lib/utils/royalty";
import { STREAM_RATE_USDC_PER_MINUTE } from "@/lib/utils/streaming";

const TOPUP_AMOUNT = 1; // USDC per top-up tap

interface Props {
  workId: string;
  src: string;
  title?: string;
  /** Owner or contributor of this work — listens free, no meter. */
  free?: boolean;
  signedIn?: boolean;
}

/**
 * Pay-per-listen wrapper around AudioPlayer (Mode 1, internal pocket).
 * Meters real listening via onSecondsPlayed and charges $0.001/min through the
 * /api/works/[id]/stream heartbeat, debiting the listener's pocket and crediting
 * contributors. Pauses and prompts a top-up when the pocket runs dry.
 */
export function StreamingAudioPlayer({ workId, src, title, free, signedIn }: Props) {
  const [pocketBalance, setPocketBalance] = useState(0);
  const [paidThisSession, setPaidThisSession] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);

  const secondsRef = useRef(0);
  const chargedMinuteRef = useRef(0);
  const inFlightRef = useRef(false);
  const blockedRef = useRef(false);
  const meter = !free && signedIn;

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
        // Keep the client's minute cursor in sync with the server's truth.
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

  // Cumulative listened seconds → fire a charge each completed minute.
  const handleSeconds = useCallback(
    (seconds: number) => {
      secondsRef.current = seconds;
      if (!meter) return;
      const minute = Math.floor(seconds / 60);
      if (minute > chargedMinuteRef.current && !inFlightRef.current && !blockedRef.current) {
        heartbeat(false);
      }
    },
    [meter, heartbeat]
  );

  // Settle completed minutes when playback pauses.
  const handlePlayingChange = useCallback(
    (playing: boolean) => {
      if (!meter) return;
      if (!playing) heartbeat(false);
    },
    [meter, heartbeat]
  );

  // Final settle on navigation away / unmount.
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

  return (
    <div className="space-y-3">
      <AudioPlayer
        src={src}
        title={title}
        onSecondsPlayed={handleSeconds}
        onPlayingChange={handlePlayingChange}
        blocked={blocked}
      />

      {free ? (
        <p className="rounded-2xl bg-secondary/30 p-3 text-xs font-bold text-secondary-foreground">
          ✿ you&apos;re a creator on this stem — listening&apos;s on us.
        </p>
      ) : !signedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE] p-3">
          <p className="text-xs font-bold text-muted-foreground">
            🎧 sign in to stream &amp; support the creators —{" "}
            {formatUsdc(STREAM_RATE_USDC_PER_MINUTE)}/min.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/sign-in">
              <LogIn className="h-4 w-4" /> sign in
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border-[1.5px] border-border bg-card/70 p-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>🎧 pay-per-listen · {formatUsdc(STREAM_RATE_USDC_PER_MINUTE)}/min</span>
            <span>paid this session: {formatUsdc(paidThisSession)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold">
              pocket: <span className="text-[var(--blue-deep)]">{formatUsdc(pocketBalance)}</span>
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
