-- Simple test query to get vote counts
WITH weekly_data AS (
    SELECT 
        streamer,
        COUNT(*) as vote_count,
        MAX(created_at) as last_vote
    FROM votes
    WHERE created_at >= date_trunc('week', NOW())
    GROUP BY streamer
)
SELECT 
    w.*,
    s.username as streamer_username,
    s.profile_image_url
FROM weekly_data w
LEFT JOIN streamers s ON w.streamer = s.username
ORDER BY vote_count DESC;

-- Test supporters query
SELECT 
    u.display_name,
    COUNT(*) as total_votes,
    SUM(CASE WHEN v.created_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as today_votes,
    SUM(CASE WHEN v.created_at >= date_trunc('week', NOW()) THEN 1 ELSE 0 END) as week_votes
FROM votes v
JOIN users u ON v.user_id = u.id
GROUP BY u.display_name
ORDER BY total_votes DESC
LIMIT 10; 