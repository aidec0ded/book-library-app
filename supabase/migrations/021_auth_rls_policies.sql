-- Migration 021: Replace permissive RLS policies with user-scoped policies
-- Run in Supabase SQL Editor AFTER 020

-- =====================================================
-- DROP ALL EXISTING PERMISSIVE POLICIES
-- =====================================================

-- books
DROP POLICY IF EXISTS "Allow anonymous reads" ON books;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON books;
DROP POLICY IF EXISTS "Allow anonymous updates" ON books;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON books;

-- book_vibes
DROP POLICY IF EXISTS "Allow anonymous reads" ON book_vibes;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON book_vibes;
DROP POLICY IF EXISTS "Allow anonymous updates" ON book_vibes;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON book_vibes;

-- conversations
DROP POLICY IF EXISTS "Allow anonymous reads" ON conversations;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON conversations;
DROP POLICY IF EXISTS "Allow anonymous updates" ON conversations;

-- messages
DROP POLICY IF EXISTS "Allow anonymous reads" ON messages;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON messages;

-- memory_files
DROP POLICY IF EXISTS "Allow anonymous reads" ON memory_files;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON memory_files;
DROP POLICY IF EXISTS "Allow anonymous updates" ON memory_files;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON memory_files;

-- reader_profile
DROP POLICY IF EXISTS "Allow anonymous reads" ON reader_profile;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON reader_profile;
DROP POLICY IF EXISTS "Allow anonymous updates" ON reader_profile;

-- book_excerpts (may not have policies yet — drop if exists)
DROP POLICY IF EXISTS "Allow anonymous reads" ON book_excerpts;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON book_excerpts;
DROP POLICY IF EXISTS "Allow anonymous updates" ON book_excerpts;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON book_excerpts;

-- lists
DROP POLICY IF EXISTS "Allow anonymous reads" ON lists;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON lists;
DROP POLICY IF EXISTS "Allow anonymous updates" ON lists;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON lists;

-- list_items
DROP POLICY IF EXISTS "Allow anonymous reads" ON list_items;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON list_items;
DROP POLICY IF EXISTS "Allow anonymous updates" ON list_items;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON list_items;

-- shelves
DROP POLICY IF EXISTS "Allow anonymous reads" ON shelves;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON shelves;
DROP POLICY IF EXISTS "Allow anonymous updates" ON shelves;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON shelves;

-- shelf_items
DROP POLICY IF EXISTS "Allow anonymous reads" ON shelf_items;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON shelf_items;
DROP POLICY IF EXISTS "Allow anonymous updates" ON shelf_items;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON shelf_items;

-- new_releases
DROP POLICY IF EXISTS "Allow anonymous reads" ON new_releases;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON new_releases;
DROP POLICY IF EXISTS "Allow anonymous updates" ON new_releases;
DROP POLICY IF EXISTS "Allow anonymous deletes" ON new_releases;

-- literary_awards
DROP POLICY IF EXISTS "Allow anonymous read on literary_awards" ON literary_awards;

-- award_entries
DROP POLICY IF EXISTS "Allow anonymous read on award_entries" ON award_entries;

-- =====================================================
-- ENABLE RLS on tables that may not have it yet
-- =====================================================

ALTER TABLE book_excerpts ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_tags ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER-SCOPED POLICIES (auth.uid() = user_id)
-- =====================================================

-- Helper: creates SELECT/INSERT/UPDATE/DELETE policies for a user-scoped table
-- Expanded inline since Supabase SQL Editor doesn't support DO blocks with DDL

-- books
CREATE POLICY "Users read own data" ON books FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON books FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON books FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON books FOR DELETE USING (user_id = auth.uid());

-- book_vibes
CREATE POLICY "Users read own data" ON book_vibes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON book_vibes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON book_vibes FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON book_vibes FOR DELETE USING (user_id = auth.uid());

-- conversations
CREATE POLICY "Users read own data" ON conversations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON conversations FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON conversations FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON conversations FOR DELETE USING (user_id = auth.uid());

-- messages
CREATE POLICY "Users read own data" ON messages FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON messages FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON messages FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON messages FOR DELETE USING (user_id = auth.uid());

-- memory_files
CREATE POLICY "Users read own data" ON memory_files FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON memory_files FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON memory_files FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON memory_files FOR DELETE USING (user_id = auth.uid());

-- reader_profile
CREATE POLICY "Users read own data" ON reader_profile FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON reader_profile FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON reader_profile FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON reader_profile FOR DELETE USING (user_id = auth.uid());

-- book_excerpts
CREATE POLICY "Users read own data" ON book_excerpts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON book_excerpts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON book_excerpts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON book_excerpts FOR DELETE USING (user_id = auth.uid());

-- lists
CREATE POLICY "Users read own data" ON lists FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON lists FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON lists FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON lists FOR DELETE USING (user_id = auth.uid());

-- list_items
CREATE POLICY "Users read own data" ON list_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON list_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON list_items FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON list_items FOR DELETE USING (user_id = auth.uid());

-- shelves
CREATE POLICY "Users read own data" ON shelves FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON shelves FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON shelves FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON shelves FOR DELETE USING (user_id = auth.uid());

-- shelf_items
CREATE POLICY "Users read own data" ON shelf_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON shelf_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON shelf_items FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON shelf_items FOR DELETE USING (user_id = auth.uid());

-- user_release_scores
CREATE POLICY "Users read own data" ON user_release_scores FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own data" ON user_release_scores FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own data" ON user_release_scores FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own data" ON user_release_scores FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- SHARED REFERENCE TABLE POLICIES (authenticated read-only)
-- =====================================================

-- canonical_tags
CREATE POLICY "Authenticated read" ON canonical_tags FOR SELECT USING (auth.role() = 'authenticated');

-- literary_awards
CREATE POLICY "Authenticated read" ON literary_awards FOR SELECT USING (auth.role() = 'authenticated');

-- award_entries
CREATE POLICY "Authenticated read" ON award_entries FOR SELECT USING (auth.role() = 'authenticated');

-- new_releases (shared reference data — ingestion scripts use service_role)
CREATE POLICY "Authenticated read" ON new_releases FOR SELECT USING (auth.role() = 'authenticated');
