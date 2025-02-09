-- Create a table to track deleted usernames
CREATE TABLE IF NOT EXISTS deleted_usernames (
    display_name TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create a function to handle username deletion and tracking
CREATE OR REPLACE FUNCTION handle_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track non-null display names
    IF OLD.display_name IS NOT NULL THEN
        -- Insert the display_name into deleted_usernames table
        INSERT INTO deleted_usernames (display_name)
        VALUES (OLD.display_name)
        ON CONFLICT (display_name) 
        DO UPDATE SET deleted_at = NOW();
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically track deleted usernames
DROP TRIGGER IF EXISTS track_deleted_usernames ON users;
CREATE TRIGGER track_deleted_usernames
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_deletion();

-- Create a function to check if a username is available
CREATE OR REPLACE FUNCTION is_username_available(p_display_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if the username exists in active users
    IF EXISTS (SELECT 1 FROM users WHERE display_name = p_display_name) THEN
        RETURN FALSE;
    END IF;
    
    -- Check if the username was recently deleted (within the last hour)
    IF EXISTS (
        SELECT 1 
        FROM deleted_usernames 
        WHERE display_name = p_display_name 
        AND deleted_at > NOW() - INTERVAL '1 hour'
    ) THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT ON deleted_usernames TO authenticated;
GRANT EXECUTE ON FUNCTION is_username_available(TEXT) TO authenticated; 