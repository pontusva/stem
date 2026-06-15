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

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { KawaiiNote } from "@/components/kawaii/kawaii-note";
import { KawaiiAI } from "@/components/kawaii/kawaii-ai";
import { KawaiiWallet } from "@/components/kawaii/kawaii-wallet";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";

const LandingPage = () => {
  return (
    <div className="flex w-full flex-col items-center">
      {/* Hero */}
      <section className="relative w-full max-w-6xl px-5 py-12">
        <SparkleDecoration />
        <div className="relative flex flex-col items-center gap-6 text-center">
          <StemCloud size={180} float className="drop-shadow-sm" />
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            <span className="text-rainbow">royalties</span>{" "}
            <span className="text-foreground">that float</span>
            <br />
            <span className="text-foreground">back to everyone</span> ✨
          </h1>
          <p className="max-w-2xl text-lg font-semibold text-muted-foreground md:text-xl">
            License a creative work and USDC drifts back through everyone who made
            it — humans <span className="text-[var(--blue-deep)]">and</span> AI — on
            Arc. Soft, dreamy, and on-chain.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/sign-up">
              <Button size="lg">Get started ✿</Button>
            </Link>
            <Link href="/explore">
              <Button size="lg" variant="outline">
                Explore works
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 text-sm font-bold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--blue-deep)]" />
              USDC on Arc
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--lavender-deep)]" />
              provenance-aware splits
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--blush-deep)]" />
              AI agents get paid too
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="w-full max-w-6xl px-5 py-10">
        <h2 className="mb-8 text-center text-3xl font-extrabold md:text-4xl">
          how stem works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<KawaiiNote size={64} />}
            title="register your stems"
            description="Add a work and everyone who made it — collaborators and AI tools — with an exact royalty split for each."
          />
          <FeatureCard
            icon={<KawaiiAI size={64} />}
            title="AI gets a wallet"
            description="Every AI contributor gets its own Circle wallet and an ERC-8004 onchain identity, then earns USDC like anyone else."
          />
          <FeatureCard
            icon={<KawaiiWallet size={64} />}
            title="royalties float out"
            description="When a work is licensed via escrow, the released USDC drifts to every contributor in one happy little motion."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="relative w-full max-w-4xl px-5 py-16">
        <div className="card-cloud relative overflow-hidden p-10 text-center">
          <SparkleDecoration count={6} />
          <div className="relative flex flex-col items-center gap-4">
            <StemCloud size={96} float />
            <h2 className="text-3xl font-extrabold md:text-4xl">
              give credit where it&apos;s due — automatically 💛
            </h2>
            <p className="max-w-xl font-semibold text-muted-foreground">
              Build a creative economy where provenance pays out.
            </p>
            <Link href="/sign-up">
              <Button size="lg">Start with stem</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="w-full border-t-[1.5px] border-border py-8">
        <div className="mx-auto max-w-5xl px-5 text-center text-sm font-semibold text-muted-foreground">
          made with ☁️ + 💛 · © 2026 Circle Internet Group
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="card-cloud flex flex-col items-center p-7 text-center transition-transform duration-300 hover:-translate-y-1">
    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#EAF3FE] to-[#F3EDFE]">
      {icon}
    </div>
    <h3 className="mb-2 text-xl font-extrabold">{title}</h3>
    <p className="font-medium text-muted-foreground">{description}</p>
  </div>
);

export default LandingPage;
