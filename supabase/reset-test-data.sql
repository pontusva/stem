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
-- Test-data reset helper.
--
-- Run this ONCE in the Supabase SQL editor (or psql) to create the
-- function. After that, `npm run reset-test-data` clears all test data
-- via supabase.rpc() using the service-role key.
--
-- Clears works, contributors, licenses, royalty_payments, streaming
-- pockets/sessions/ledger, and wallet transactions. KEEPS profiles and
-- wallets, so you don't have to re-register or re-fund from the faucet.
-- (TRUNCATE ... CASCADE only flows downstream to child rows; wallets and
-- profiles are parents and are left untouched.)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reset_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE
    works,
    contributors,
    licenses,
    royalty_payments,
    pockets,
    stream_sessions,
    pocket_ledger,
    transactions
  RESTART IDENTITY CASCADE;
END;
$$;

-- Only the server-side service-role key may run it.
REVOKE EXECUTE ON FUNCTION public.reset_test_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_test_data() TO service_role;
