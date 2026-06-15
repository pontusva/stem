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

-- ---------------------------------------------------------------------
-- Dedicated public bucket for streamable audio stems (mp3/wav/ogg/flac).
-- Public read so the work detail page can stream via HTTP range requests;
-- uploads happen server-side with the service client. The works.file_url
-- column (added in the royalty schema migration) holds the public URL.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'stems',
    'stems',
    true,
    false,
    104857600, -- 100 MB — audio masters can be large
    ARRAY[
        'audio/mpeg', 'audio/mp3',
        'audio/wav', 'audio/x-wav', 'audio/wave',
        'audio/ogg', 'audio/vorbis',
        'audio/flac', 'audio/x-flac'
    ]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    public = EXCLUDED.public;
