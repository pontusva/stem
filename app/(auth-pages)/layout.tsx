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

import { StemCloud } from "@/components/kawaii/stem-cloud";
import { SparkleDecoration } from "@/components/kawaii/sparkle-decoration";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md">
        <SparkleDecoration count={8} className="-inset-10" />
        <div className="relative z-10 mb-[-28px] flex justify-center">
          <StemCloud size={88} float />
        </div>
        <div className="card-cloud relative z-0 px-7 pb-7 pt-12">{children}</div>
      </div>
    </div>
  );
}
