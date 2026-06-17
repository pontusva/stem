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

-- =====================================================================
-- Originality / anti-plagiarism protection
--
-- Protects original creators from someone downloading a stem and re-uploading
-- it as their own. On upload we compute a SHA-256 (exact-dup fast path) and a
-- Chromaprint acoustic fingerprint (robust to re-encoding/trimming), then
-- compare against the catalog. A strong match forces ATTRIBUTION: the uploader
-- must declare the matched work as parent (→ 20% upstream royalty) to publish.
--
-- A work now has a lifecycle: DRAFT (created, not yet live) → ACTIVE (passed
-- the originality gate, publicly listed/licensable) | PENDING_ATTRIBUTION
-- (matched an existing work, awaiting the uploader to attribute) | BLOCKED
-- (taken down via a report). Only ACTIVE works are listed and licensable.
-- =====================================================================

ALTER TABLE works
    ADD COLUMN IF NOT EXISTS file_sha256             TEXT,
    ADD COLUMN IF NOT EXISTS audio_fingerprint       JSONB,   -- Chromaprint raw int array (music only)
    ADD COLUMN IF NOT EXISTS fingerprint_duration    INT,     -- seconds, for fingerprint alignment
    ADD COLUMN IF NOT EXISTS suspected_parent_work_id UUID REFERENCES works(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS match_score             REAL,    -- best similarity 0..1, for tuning/audit
    ADD COLUMN IF NOT EXISTS ownership_affirmed_at    TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS terms_version            TEXT;

-- Existing rows predate the lifecycle; they're already public, so keep them ACTIVE.
-- (status already defaults to 'ACTIVE'; new uploads will be created as 'DRAFT'.)
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_sha256 ON works(file_sha256);
-- Prefilter for fingerprint comparison: music works that carry a fingerprint.
CREATE INDEX IF NOT EXISTS idx_works_fp_candidates
    ON works(work_type, fingerprint_duration)
    WHERE audio_fingerprint IS NOT NULL;

COMMENT ON COLUMN works.status IS
    'DRAFT | ACTIVE | PENDING_ATTRIBUTION | BLOCKED. Only ACTIVE works are listed and licensable.';

-- ---------------------------------------------------------------------
-- Plagiarism / abuse reports (the human safety net behind detection).
-- One row per report; admins resolve them (uphold → takedown, or dismiss).
-- ---------------------------------------------------------------------
CREATE TABLE work_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id             UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    reporter_profile_id UUID NOT NULL REFERENCES profiles(id),
    reason              TEXT NOT NULL DEFAULT 'PLAGIARISM',   -- PLAGIARISM | OTHER
    details             TEXT,
    status              TEXT NOT NULL DEFAULT 'OPEN',         -- OPEN | UPHELD | DISMISSED
    resolver_profile_id UUID REFERENCES profiles(id),
    resolved_at         TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_work_reports_work_id ON work_reports(work_id);
CREATE INDEX idx_work_reports_status ON work_reports(status);

-- RLS: a reporter can see their own reports; the reported work's owner can see
-- reports against their work. All writes happen server-side via the
-- service_role client (which bypasses RLS), including admin resolution.
ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_reports_select" ON work_reports
    FOR SELECT USING (
        reporter_profile_id = public.current_profile_id()
        OR EXISTS (
            SELECT 1 FROM works wk
            WHERE wk.id = work_reports.work_id
              AND wk.owner_profile_id = public.current_profile_id()
        )
    );

-- ---------------------------------------------------------------------
-- Grants (mirror the royalty / validations schema)
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMENT ON TABLE work_reports IS 'User-filed plagiarism/abuse reports; admins uphold (→ work BLOCKED) or dismiss.';
