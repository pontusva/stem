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

import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { type FunctionComponent } from "react";
import { toast } from "sonner";

interface Props {
  walletAddress: string;
}

const ARC_FAUCET_URL = "https://faucet.circle.com";

/**
 * Arc Testnet is not served by Circle's programmatic /v1/faucet/drips API
 * (it 403s for ARC-TESTNET). The working path is the web faucet, so this
 * copies the wallet address and opens it for the user.
 */
export const RequestUsdcButton: FunctionComponent<Props> = ({ walletAddress }) => {
  const openFaucet = async () => {
    try {
      if (walletAddress) {
        await navigator.clipboard.writeText(walletAddress);
        toast.success("Wallet address copied — paste it into the faucet (select Arc Testnet)");
      }
    } catch {
      toast.message("Opening the Circle faucet — paste your wallet address there");
    }
    window.open(ARC_FAUCET_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <Button variant="outline" onClick={openFaucet}>
      <ExternalLink className="mr-2 h-4 w-4" />
      Fund via Faucet
    </Button>
  );
};