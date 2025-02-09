-- First, drop the existing constraint
ALTER TABLE nominations DROP CONSTRAINT IF EXISTS nominations_nominated_by_fkey;

-- Recreate the constraint with ON DELETE CASCADE
ALTER TABLE nominations 
ADD CONSTRAINT nominations_nominated_by_fkey 
FOREIGN KEY (nominated_by) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Add an index to improve performance
CREATE INDEX IF NOT EXISTS idx_nominations_nominated_by 
ON nominations(nominated_by);

-- Grant necessary permissions
GRANT SELECT, DELETE ON nominations TO authenticated; 