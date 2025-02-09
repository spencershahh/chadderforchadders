-- Check if tables exist and have data
SELECT 
    table_name, 
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
    pg_total_relation_size(quote_ident(table_name)) as table_size
FROM (
    VALUES ('votes'), ('weekly_winners'), ('subscription_revenue'), ('streamers'), ('users')
) as t(table_name)
WHERE EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = t.table_name
);

-- Check votes table structure and sample data
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'votes';

SELECT COUNT(*) as vote_count FROM votes;
SELECT * FROM votes LIMIT 5;

-- Check weekly_winners structure and data
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'weekly_winners';

SELECT COUNT(*) as winner_count FROM weekly_winners;
SELECT * FROM weekly_winners LIMIT 5;

-- Check streamers table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'streamers';

SELECT COUNT(*) as streamer_count FROM streamers;
SELECT * FROM streamers LIMIT 5;

-- Test the donation bomb calculation
SELECT calculate_weekly_donation_bomb() as current_donation_bomb;

-- Check permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'votes';

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'; 