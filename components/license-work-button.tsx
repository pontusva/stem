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
import { Loader2, Sparkles, ShieldCheck, ShieldX, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatUsdc } from "@/lib/utils/royalty";

const EXPLORER = "https://testnet.arcscan.app";

interface Props {
  workId: string;
  price: number;
  disabled?: boolean;
}

type Step = "confirm" | "validating" | "passed" | "rejected";

interface PassedInfo {
  validatorName: string;
  validatorAddress: string;
  confidence: number;
  reasoning: string;
  feeUsdc: number;
  failedOpen: boolean;
  feeTxHash?: string;
}

interface RejectedInfo {
  reasoning: string;
  confidence: number;
}

/**
 * Buy a derivative license with an instant, direct split payment — gated by the
 * STEM Validator AI. The dialog walks through confirm → validating → passed |
 * rejected: a paid AI review runs server-side before any funds move, and the
 * validator earns a small fee for that work.
 */
export function LicenseWorkButton({ workId, price, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("confirm");
  const [passed, setPassed] = useState<PassedInfo | null>(null);
  const [rejected, setRejected] = useState<RejectedInfo | null>(null);

  const busy = step === "validating";

  function reset() {
    setStep("confirm");
    setPassed(null);
    setRejected(null);
  }

  async function buy() {
    setStep("validating");
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId }),
      });
      const json = await res.json();

      if (res.status === 422) {
        setRejected({
          reasoning: json.reasoning || "The work did not pass validation.",
          confidence: Number(json.confidence ?? 0),
        });
        setStep("rejected");
        return;
      }
      if (!res.ok) throw new Error(json.error || "Purchase failed");

      const v = json.validation ?? {};
      setPassed({
        validatorName: v.validatorName ?? "STEM Validator",
        validatorAddress: v.validatorAddress ?? "",
        confidence: Number(v.confidence ?? 0),
        reasoning: v.reasoning ?? "",
        feeUsdc: Number(v.feeUsdc ?? 0),
        failedOpen: !!v.failedOpen,
        feeTxHash: v.feeTxHash,
      });
      setStep("passed");
      toast.success("License granted — download & remix unlocked! ✨");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Purchase failed");
      setStep("confirm");
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} className="w-full">
          Buy license · {formatUsdc(price)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {step === "confirm" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Buy this license for {formatUsdc(price)}?</AlertDialogTitle>
              <AlertDialogDescription>
                First, the <strong>STEM Validator</strong> AI reviews the delivered work.
                If it passes, your {formatUsdc(price)} is paid instantly: a small validation
                fee goes to the validator for its work, and the rest splits to every
                contributor (human &amp; AI) by their share — download &amp; remix unlock right
                away. If it fails, nothing is charged.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button onClick={buy}>
                <Sparkles className="h-4 w-4" /> Validate &amp; pay {formatUsdc(price)}
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {step === "validating" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--lavender-deep)]" />
            <p className="text-lg font-extrabold">STEM Validator is reviewing this work…</p>
            <p className="text-sm font-semibold text-muted-foreground">
              An AI reviewer is checking the delivered work before any USDC moves. This
              usually takes a few seconds.
            </p>
          </div>
        )}

        {step === "passed" && passed && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[#3E9E68]">
                <ShieldCheck className="h-5 w-5" /> Validated &amp; licensed ✨
              </AlertDialogTitle>
              <AlertDialogDescription>
                {passed.failedOpen
                  ? "The validator was briefly unavailable, so the sale proceeded without a review and no validation fee was charged."
                  : passed.reasoning}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 rounded-2xl bg-[#D6F5E3]/50 p-3 text-sm font-bold">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">reviewer</span>
                <span>{passed.validatorName}</span>
              </div>
              {!passed.failedOpen && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">confidence</span>
                    <span>{Math.round(passed.confidence * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">validation fee paid</span>
                    <span>{formatUsdc(passed.feeUsdc, 4)}</span>
                  </div>
                </>
              )}
              {(passed.feeTxHash || passed.validatorAddress) && (
                <a
                  href={
                    passed.feeTxHash
                      ? `${EXPLORER}/tx/${passed.feeTxHash}`
                      : `${EXPLORER}/address/${passed.validatorAddress}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[var(--blue-deep)] hover:underline"
                >
                  view on arcscan <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <AlertDialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                  router.refresh();
                }}
              >
                Done
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {step === "rejected" && rejected && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldX className="h-5 w-5" /> Validation failed — not charged
              </AlertDialogTitle>
              <AlertDialogDescription>
                The STEM Validator didn&apos;t approve this work, so the purchase was
                cancelled and <strong>no USDC was moved</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-2xl bg-destructive/10 p-3 text-sm font-bold text-destructive">
              {rejected.reasoning}
            </div>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Close
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
