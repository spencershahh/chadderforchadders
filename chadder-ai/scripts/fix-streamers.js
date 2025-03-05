// This script fixes common issues with the streamers data

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to JSON files
const publicJsonPath = path.resolve(process.cwd(), '..', 'public', 'streamers.json');
const srcJsonPath = path.resolve(process.cwd(), '..', 'src', 'data', 'streamers.json');

async function fixStreamers() {
  try {
    console.log('========== STREAMERS DATA FIX UTILITY ==========');
    console.log('Checking streamers table in database...');
    
    // Check if table exists
    const { data: tableExists, error: tableError } = await supabase
      .from('streamers')
      .select('*')
      .limit(1);
      
    if (tableError) {
      console.error('Error accessing streamers table:', tableError.message);
      if (tableError.code === '42P01') { // Table doesn't exist
        console.log('Table "streamers" does not exist. You need to run the migrations first.');
        process.exit(1);
      }
    }
    
    // Check JSON files
    console.log('Checking JSON files...');
    
    let publicStreamers = [];
    let srcStreamers = [];
    
    try {
      if (fs.existsSync(publicJsonPath)) {
        publicStreamers = JSON.parse(fs.readFileSync(publicJsonPath, 'utf8'));
        console.log(`Found ${publicStreamers.length} streamers in public/streamers.json`);
      } else {
        console.log('public/streamers.json does not exist');
      }
    } catch (error) {
      console.error('Error reading public/streamers.json:', error.message);
    }
    
    try {
      if (fs.existsSync(srcJsonPath)) {
        srcStreamers = JSON.parse(fs.readFileSync(srcJsonPath, 'utf8'));
        console.log(`Found ${srcStreamers.length} streamers in src/data/streamers.json`);
      } else {
        console.log('src/data/streamers.json does not exist');
      }
    } catch (error) {
      console.error('Error reading src/data/streamers.json:', error.message);
    }
    
    // Use the source with most streamers
    const streamers = publicStreamers.length >= srcStreamers.length ? publicStreamers : srcStreamers;
    
    if (streamers.length === 0) {
      console.error('No streamers data found in either JSON file. Cannot proceed.');
      process.exit(1);
    }
    
    // Check database streamers
    const { data: dbStreamers, error: dbError } = await supabase
      .from('streamers')
      .select('*');
      
    if (dbError) {
      console.error('Error fetching streamers from database:', dbError.message);
    } else {
      console.log(`Found ${dbStreamers?.length || 0} streamers in database`);
    }
    
    // Check schema
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'streamers');
      
    if (schemaError) {
      console.error('Error checking table schema:', schemaError.message);
    } else {
      const columnNames = columns.map(c => c.column_name);
      console.log('Table columns:', columnNames.join(', '));
      
      // Check if we have the required columns
      const hasNameColumn = columnNames.includes('name');
      const hasUsernameColumn = columnNames.includes('username');
      
      console.log('Has "name" column:', hasNameColumn);
      console.log('Has "username" column:', hasUsernameColumn);
      
      if (!hasNameColumn && !hasUsernameColumn) {
        console.error('Error: Neither "name" nor "username" column found in streamers table');
        process.exit(1);
      }
      
      // Prepare data for insertion
      const streamersToUpsert = streamers.map(streamer => {
        const result = {};
        
        if (hasNameColumn) {
          result.name = streamer.username;
        }
        
        if (hasUsernameColumn) {
          result.username = streamer.username;
        }
        
        result.bio = streamer.bio || 'No bio available';
        
        return result;
      });
      
      console.log('\nReady to update database with streamers data');
      console.log(`Will upsert ${streamersToUpsert.length} streamers`);
      
      // Confirm before proceeding
      const confirmation = process.argv.includes('--force') ? 'y' : 
        await new Promise(resolve => {
          process.stdout.write('Proceed with database update? (y/N): ');
          process.stdin.once('data', data => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
        
      if (confirmation !== 'y') {
        console.log('Operation cancelled');
        process.exit(0);
      }
      
      // Update database
      const { error: upsertError } = await supabase
        .from('streamers')
        .upsert(streamersToUpsert, { 
          onConflict: hasNameColumn ? 'name' : 'username',
          ignoreDuplicates: false 
        });
        
      if (upsertError) {
        console.error('Error updating streamers in database:', upsertError.message);
      } else {
        console.log('Streamers data successfully updated in database');
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error.message);
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixStreamers(); 