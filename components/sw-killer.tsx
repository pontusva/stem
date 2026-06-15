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

import { useEffect } from "react";

/**
 * This app ships no service worker. But a previous (Vite/PWA) app on the same
 * localhost port may have registered one that intercepts requests and serves a
 * stale cached bundle. Proactively unregister any leftover service worker and
 * clear caches so users always run the current code.
 */
export function ServiceWorkerKiller() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let unregistered = false;
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => {
        reg.unregister();
        unregistered = true;
      });
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      // A stale SW already controls this page; reload once to drop it.
      if (unregistered && navigator.serviceWorker.controller) {
        window.location.reload();
      }
    });
  }, []);

  return null;
}
