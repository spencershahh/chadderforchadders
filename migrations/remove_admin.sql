-- Drop admin-related policies
DROP POLICY IF EXISTS "Admin users can do everything" ON users;
DROP POLICY IF EXISTS "Admin can manage streamers" ON streamers;
DROP POLICY IF EXISTS "Admin can manage users" ON users;

-- Remove admin-related columns
ALTER TABLE users DROP COLUMN IF EXISTS is_admin CASCADE;

-- Drop admin-related functions
DROP FUNCTION IF EXISTS set_admin_status(UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS is_admin(UUID) CASCADE;

-- Drop admin-related views
DROP VIEW IF EXISTS admin_dashboard CASCADE;
DROP VIEW IF EXISTS admin_metrics CASCADE;

-- Drop admin-related tables
DROP TABLE IF EXISTS admin_logs CASCADE;
DROP TABLE IF EXISTS admin_actions CASCADE;

-- Remove admin role
REVOKE admin FROM authenticated;
DROP ROLE IF EXISTS admin;