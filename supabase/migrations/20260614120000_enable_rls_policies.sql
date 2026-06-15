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
-- Authoritative RLS migration.
--
-- Re-enables Row Level Security on every public table and defines policies
-- against the CURRENT identity model:
--   * auth.uid()  -> profiles.auth_user_id   (profiles has its own UUID PK)
--   * ownership chains through profiles.id via *_profile_id columns
--   * AI wallets have profile_id IS NULL and are owned via created_by_profile_id
--
-- Access model:
--   * wallets / transactions / escrow_agreements / dispute_resolutions: strict
--     per-user isolation.
--   * works + contributors: public read (public catalog), owner-only writes.
--   * licenses + royalty_payments: visible only to the buyer and the work owner
--     (financials). Status transitions / payout fan-out happen server-side via
--     the service_role client, which bypasses RLS.
--
-- service_role bypasses RLS entirely, so server actions are unaffected.
-- =====================================================================

-- Resolve the caller's profile id once. SECURITY INVOKER (default): it only
-- reads the caller's own profile row, which profiles' own SELECT policy already
-- permits, so there is no privilege escalation and no policy recursion.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles
    FOR SELECT USING (is_active = true OR auth_user_id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "profiles_update" ON profiles
    FOR UPDATE USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- wallets  (owner = profile_id, or created_by_profile_id for AI agents)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own wallets" ON wallets;
DROP POLICY IF EXISTS "Users can update own wallets" ON wallets;
DROP POLICY IF EXISTS "Users can insert own wallets" ON wallets;
DROP POLICY IF EXISTS "wallets_select" ON wallets;
DROP POLICY IF EXISTS "wallets_insert" ON wallets;
DROP POLICY IF EXISTS "wallets_update" ON wallets;

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_select" ON wallets
    FOR SELECT USING (
        profile_id = public.current_profile_id()
        OR created_by_profile_id = public.current_profile_id()
    );
CREATE POLICY "wallets_insert" ON wallets
    FOR INSERT WITH CHECK (
        profile_id = public.current_profile_id()
        OR created_by_profile_id = public.current_profile_id()
    );
CREATE POLICY "wallets_update" ON wallets
    FOR UPDATE USING (
        profile_id = public.current_profile_id()
        OR created_by_profile_id = public.current_profile_id()
    );

-- ---------------------------------------------------------------------
-- transactions  (owner = profile_id)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select" ON transactions
    FOR SELECT USING (profile_id = public.current_profile_id());
CREATE POLICY "transactions_insert" ON transactions
    FOR INSERT WITH CHECK (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------
-- escrow_agreements  (related if caller owns either wallet)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view related escrow agreements" ON escrow_agreements;
DROP POLICY IF EXISTS "Users can insert escrow agreements" ON escrow_agreements;
DROP POLICY IF EXISTS "escrow_agreements_select" ON escrow_agreements;
DROP POLICY IF EXISTS "escrow_agreements_insert" ON escrow_agreements;

ALTER TABLE escrow_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escrow_agreements_select" ON escrow_agreements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wallets w
            WHERE (w.id = escrow_agreements.beneficiary_wallet_id
                   OR w.id = escrow_agreements.depositor_wallet_id)
              AND w.profile_id = public.current_profile_id()
        )
    );
CREATE POLICY "escrow_agreements_insert" ON escrow_agreements
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM wallets w
            WHERE (w.id = beneficiary_wallet_id OR w.id = depositor_wallet_id)
              AND w.profile_id = public.current_profile_id()
        )
    );

-- ---------------------------------------------------------------------
-- dispute_resolutions  (resolver, or party to the related agreement)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view related dispute resolutions" ON dispute_resolutions;
DROP POLICY IF EXISTS "dispute_resolutions_select" ON dispute_resolutions;

ALTER TABLE dispute_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispute_resolutions_select" ON dispute_resolutions
    FOR SELECT USING (
        resolver_profile_id = public.current_profile_id()
        OR EXISTS (
            SELECT 1 FROM escrow_agreements ea
            JOIN wallets w ON (w.id = ea.beneficiary_wallet_id
                               OR w.id = ea.depositor_wallet_id)
            WHERE ea.id = dispute_resolutions.escrow_agreement_id
              AND w.profile_id = public.current_profile_id()
        )
    );

-- ---------------------------------------------------------------------
-- works  (public catalog read, owner-only writes)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "works_select" ON works;
DROP POLICY IF EXISTS "works_insert" ON works;
DROP POLICY IF EXISTS "works_update" ON works;
DROP POLICY IF EXISTS "works_delete" ON works;

ALTER TABLE works ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_select" ON works
    FOR SELECT USING (true);
CREATE POLICY "works_insert" ON works
    FOR INSERT WITH CHECK (owner_profile_id = public.current_profile_id());
CREATE POLICY "works_update" ON works
    FOR UPDATE USING (owner_profile_id = public.current_profile_id())
    WITH CHECK (owner_profile_id = public.current_profile_id());
CREATE POLICY "works_delete" ON works
    FOR DELETE USING (owner_profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------
-- contributors  (public read, writes by owner of the parent work)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "contributors_select" ON contributors;
DROP POLICY IF EXISTS "contributors_insert" ON contributors;
DROP POLICY IF EXISTS "contributors_update" ON contributors;
DROP POLICY IF EXISTS "contributors_delete" ON contributors;

ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contributors_select" ON contributors
    FOR SELECT USING (true);
CREATE POLICY "contributors_insert" ON contributors
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM works wk
                WHERE wk.id = contributors.work_id
                  AND wk.owner_profile_id = public.current_profile_id())
    );
CREATE POLICY "contributors_update" ON contributors
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM works wk
                WHERE wk.id = contributors.work_id
                  AND wk.owner_profile_id = public.current_profile_id())
    );
CREATE POLICY "contributors_delete" ON contributors
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM works wk
                WHERE wk.id = contributors.work_id
                  AND wk.owner_profile_id = public.current_profile_id())
    );

-- ---------------------------------------------------------------------
-- licenses  (buyer or work owner read; buyer creates. Status updates are
-- driven server-side via service_role, which bypasses RLS.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "licenses_select" ON licenses;
DROP POLICY IF EXISTS "licenses_insert" ON licenses;

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licenses_select" ON licenses
    FOR SELECT USING (
        buyer_profile_id = public.current_profile_id()
        OR EXISTS (SELECT 1 FROM works wk
                   WHERE wk.id = licenses.work_id
                     AND wk.owner_profile_id = public.current_profile_id())
    );
CREATE POLICY "licenses_insert" ON licenses
    FOR INSERT WITH CHECK (buyer_profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------
-- royalty_payments  (read by the paid contributor, the buyer, or the work
-- owner. Inserts/updates happen server-side via service_role only.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "royalty_payments_select" ON royalty_payments;

ALTER TABLE royalty_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "royalty_payments_select" ON royalty_payments
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM wallets w
            WHERE w.profile_id = public.current_profile_id()
               OR w.created_by_profile_id = public.current_profile_id()
        )
        OR EXISTS (
            SELECT 1 FROM licenses l
            JOIN works wk ON wk.id = l.work_id
            WHERE l.id = royalty_payments.license_id
              AND (l.buyer_profile_id = public.current_profile_id()
                   OR wk.owner_profile_id = public.current_profile_id())
        )
    );

-- =====================================================================
-- Advisor hardening (lower severity): pin search_path on existing trigger
-- functions and revoke broad EXECUTE on SECURITY DEFINER functions.
-- Guarded so the migration is robust if a function is absent.
-- =====================================================================
DO $$
DECLARE
    fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.update_updated_at_column()',
        'public.handle_profile_picture_update()',
        'public.storage_folder_structure()'
    ] LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
        EXCEPTION WHEN undefined_function THEN
            RAISE NOTICE 'skipped search_path pin for missing function %', fn;
        END;
    END LOOP;

    FOREACH fn IN ARRAY ARRAY[
        'public.handle_new_user()',
        'public.rls_auto_enable()'
    ] LOOP
        BEGIN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
        EXCEPTION WHEN undefined_function THEN
            RAISE NOTICE 'skipped execute revoke for missing function %', fn;
        END;
    END LOOP;
END $$;
