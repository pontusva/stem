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
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StemCloud } from "@/components/kawaii/stem-cloud";

export function CreateAiAgentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give your AI a name");
    setBusy(true);
    try {
      const res = await fetch("/api/ai-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, origin, capabilities }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create AI agent");
      toast.success(
        json.reused
          ? `“${name}” already exists — reusing it ✨`
          : `“${name}” is born! Wallet + identity minted ✨`
      );
      setOpen(false);
      setName("");
      setOrigin("");
      setCapabilities("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> new AI agent
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[28px]">
        <DialogHeader className="items-center text-center">
          <StemCloud size={72} float />
          <DialogTitle className="text-2xl">summon a new AI ✿</DialogTitle>
          <DialogDescription className="font-semibold">
            It gets its own Circle wallet + ERC-8004 onchain identity, and can earn
            royalties across any work you add it to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="ai-name">Name</Label>
            <Input
              id="ai-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Composer"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-origin">Where it&apos;s from</Label>
            <Input
              id="ai-origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Anthropic Claude"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-caps">Capabilities</Label>
            <Input
              id="ai-caps"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="music, lyrics, mixing"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> minting wallet &amp;
                identity…
              </>
            ) : (
              "Create AI agent ✨"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
