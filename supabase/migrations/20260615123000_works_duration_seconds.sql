-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Playback length of a work's audio stem, extracted server-side with
-- music-metadata at upload time. Used later for time-based payment triggers.
-- NUMERIC(10,3) keeps millisecond precision up to ~115 days of audio.
ALTER TABLE works
ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(10, 3);

COMMENT ON COLUMN works.duration_seconds IS
    'Audio stem playback length in seconds (music-metadata), null for non-audio works.';
