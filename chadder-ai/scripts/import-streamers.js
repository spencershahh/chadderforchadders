require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importStreamers() {
  try {
    console.log('Starting streamer import...');
    
    // Read the JSON file
    const filePath = path.resolve(process.cwd(), 'public', 'streamers.json');
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    
    const streamersData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!Array.isArray(streamersData)) {
      console.error('Error: Invalid streamers data format. Expected an array.');
      process.exit(1);
    }
    
    console.log(`Found ${streamersData.length} streamers in JSON file`);
    
    // Check if table exists
    const { error: tableError } = await supabase
      .from('streamers')
      .select('id')
      .limit(1);
      
    if (tableError) {
      console.error('Error: streamers table does not exist in the database. Run the create_streamers_table.sql migration first.');
      process.exit(1);
    }
    
    // First, clear existing data
    const { error: deleteError } = await supabase
      .from('streamers')
      .delete()
      .neq('username', 'placeholder');
      
    if (deleteError) {
      console.error('Error clearing existing streamers:', deleteError);
      process.exit(1);
    }
    
    // Insert the streamers
    const { error: insertError } = await supabase
      .from('streamers')
      .insert(streamersData.map(s => ({
        username: s.username,
        bio: s.bio
      })));
      
    if (insertError) {
      console.error('Error inserting streamers:', insertError);
      process.exit(1);
    }
    
    console.log('Successfully imported streamers to database');
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

importStreamers(); 