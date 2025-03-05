import 'dotenv/config'; // This automatically loads the .env file
import { createClient } from '@supabase/supabase-js';
import streamers from './src/data/streamers.json' assert { type: 'json' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const uploadStreamers = async () => {
  try {
    console.log('Checking streamers table schema...');
    
    // Check if table exists and has 'username' or 'name' column
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'streamers');
      
    if (schemaError) {
      console.error('Error checking table schema:', schemaError);
      return;
    }
    
    const columnNames = columns ? columns.map(c => c.column_name) : [];
    console.log('Available columns:', columnNames);
    
    // Determine if we should use 'name' or 'username'
    const useNameField = columnNames.includes('name');
    const useUsernameField = columnNames.includes('username');
    
    if (!useNameField && !useUsernameField) {
      console.error('Error: Neither "name" nor "username" column found in streamers table');
      return;
    }
    
    // First check if there are existing streamers
    const { data: existingStreamers, error: checkError } = await supabase
      .from('streamers')
      .select('*')
      .limit(1);
      
    if (checkError) {
      console.error('Error checking existing streamers:', checkError);
      return;
    }
    
    // If there are existing streamers, confirm before overwriting
    if (existingStreamers && existingStreamers.length > 0) {
      console.log('WARNING: There are existing streamers in the database');
      const confirmation = process.argv.includes('--force') ? 'y' : 
        await new Promise(resolve => {
          process.stdout.write('Do you want to continue and potentially overwrite data? (y/N): ');
          process.stdin.once('data', data => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
        
      if (confirmation !== 'y') {
        console.log('Operation cancelled');
        process.exit(0);
      }
    }
    
    // Map streamers to database structure
    const streamersToUpload = streamers.map((streamer) => {
      const mapped = {};
      
      if (useNameField) {
        mapped.name = streamer.username;
      }
      
      if (useUsernameField) {
        mapped.username = streamer.username;
      }
      
      mapped.bio = streamer.bio;
      mapped.votes_count = 0;
      
      return mapped;
    });
    
    console.log(`Uploading ${streamersToUpload.length} streamers to Supabase...`);
    
    // Insert the streamers
    const { error } = await supabase
      .from('streamers')
      .upsert(streamersToUpload, { 
        onConflict: useNameField ? 'name' : 'username',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error uploading streamers:', error);
    } else {
      console.log('Streamers uploaded successfully');
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
  } finally {
    process.exit(0);
  }
};

// Run the function
uploadStreamers();