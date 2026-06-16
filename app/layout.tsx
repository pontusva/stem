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

import { EnvVarWarning } from "@/components/env-var-warning";
import HeaderAuth from "@/components/header-auth";
import { hasEnvVars } from "@/lib/utils/supabase/check-env-vars";
import { Nunito } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";
import "./globals.css";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ServiceWorkerKiller } from "@/components/sw-killer";
import { StemCloud } from "@/components/kawaii/stem-cloud";
import { getBaseUrl } from "@/lib/utils/base-url";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const defaultUrl = getBaseUrl();

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "stem — royalties that follow the work",
  description:
    "Dreamy, provenance-aware royalties on Arc. License a creative work and USDC floats back to every contributor, human and AI. ✨",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <body className="font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Toaster expand />
          <ServiceWorkerKiller />
          <div className="flex min-h-screen flex-col">
            {/* Fluffy floating header */}
            <nav className="fixed inset-x-0 top-0 z-50 h-20 px-4 pt-3">
              <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between rounded-full border-[1.5px] border-border bg-card/80 px-5 shadow-cloud backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <ThemeSwitcher />
                  <Link
                    href="/"
                    className="group flex items-center gap-2 transition-transform hover:scale-[1.03]"
                  >
                    <StemCloud size={42} notes={false} className="group-hover:animate-wiggle" />
                    <span className="text-rainbow text-2xl font-extrabold lowercase tracking-tight">
                      stem
                    </span>
                  </Link>
                  <Link
                    href="/explore"
                    className="hidden rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground sm:inline-block"
                  >
                    explore
                  </Link>
                  <Link
                    href="/validator"
                    className="hidden rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground sm:inline-block"
                  >
                    validator
                  </Link>
                </div>
                {!hasEnvVars ? <EnvVarWarning /> : <HeaderAuth />}
              </div>
            </nav>

            <main className="flex flex-1 flex-col items-center px-4 pb-16 pt-28">
              <div className="w-full max-w-7xl">{children}</div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
