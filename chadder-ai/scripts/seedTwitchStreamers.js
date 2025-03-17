import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Sample popular Twitch streamers to seed if API fails
const sampleStreamers = [
  {
    twitch_id: '149747285',
    username: 'tenz',
    display_name: 'TenZ',
    description: 'Professional VALORANT player for Sentinels',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/a4e8f7ff-fd45-4211-b10a-8f7322ead2c4-profile_image-300x300.png',
    view_count: 25000,
    votes: 150,
    is_live: true
  },
  {
    twitch_id: '71092938',
    username: 'xqc',
    display_name: 'xQc',
    description: 'Variety streamer and former professional Overwatch player',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/xqc-profile_image-9298dca608632101-300x300.jpeg',
    view_count: 98000,
    votes: 320,
    is_live: true
  },
  {
    twitch_id: '31239503',
    username: 'shroud',
    display_name: 'shroud',
    description: 'Former CS:GO pro player, now a full-time streamer',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/7ed5e0c6-0191-4eef-8328-4af6e4ea5318-profile_image-300x300.png',
    view_count: 72000,
    votes: 280,
    is_live: false
  },
  {
    twitch_id: '26301881',
    username: 'sodapoppin',
    display_name: 'sodapoppin',
    description: 'Variety streamer and one of the oldest established streamers on the platform',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/sodapoppin-profile_image-10049b6200f90c14-300x300.png',
    view_count: 45000,
    votes: 210,
    is_live: true
  },
  {
    twitch_id: '23161357',
    username: 'lirik',
    display_name: 'LIRIK',
    description: 'One of the most popular variety streamers on Twitch',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/lirik-profile_image-9e59331f301358d3-300x300.jpeg',
    view_count: 38000,
    votes: 190,
    is_live: false
  },
  {
    twitch_id: '125387632',
    username: 'valorant',
    display_name: 'VALORANT',
    description: 'Official VALORANT Twitch channel',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/valorant-profile_image-d05a5693a819ecad-300x300.jpeg',
    view_count: 120000,
    votes: 420,
    is_live: true
  },
  {
    twitch_id: '51496027',
    username: 'pokimane',
    display_name: 'pokimane',
    description: 'Variety streamer, co-founder of OfflineTV',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/pokimane-profile_image-1908a0321bf90c30-300x300.png',
    view_count: 32000,
    votes: 175,
    is_live: false
  },
  {
    twitch_id: '24147592',
    username: 'symfuhny',
    display_name: 'Symfuhny',
    description: 'Professional Fortnite player and variety streamer',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/4f47c354-0bb4-4c4c-85bc-9ee886811a72-profile_image-300x300.png',
    view_count: 18000,
    votes: 120,
    is_live: true
  },
  {
    twitch_id: '103325125',
    username: 'amouranth',
    display_name: 'Amouranth',
    description: 'Variety streamer, cosplayer, and content creator',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/amouranth-profile_image-77b6e10b6af1bf73-300x300.jpeg',
    view_count: 28000,
    votes: 160,
    is_live: true
  },
  {
    twitch_id: '19070311',
    username: 'a_seagull',
    display_name: 'A_Seagull',
    description: 'Former professional Overwatch player, now a variety streamer',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/a_seagull-profile_image-4d2d235688c7dc66-300x300.png',
    view_count: 8500,
    votes: 95,
    is_live: false
  }
];

/**
 * Runs a SQL file to fix any schema issues before seeding
 */
async function fixSchema() {
  try {
    console.log('Checking and fixing schema issues...');
    
    // Get the SQL from the file
    const sqlFilePath = path.join(process.cwd(), 'scripts', 'add_missing_columns.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL using Supabase
    const { error } = await supabase.rpc('pgadmin_exec_sql', { sql });
    
    if (error) {
      if (error.message.includes('function "pgadmin_exec_sql" does not exist')) {
        console.log('Admin SQL function not available. Trying alternate approach...');
        
        // We can't run custom SQL directly, so let's list table columns to check
        const { data: columns, error: columnsError } = await supabase
          .from('twitch_streamers')
          .select('*')
          .limit(1);
          
        if (columnsError) {
          throw columnsError;
        }
        
        // Log available columns
        console.log('Available columns in twitch_streamers:');
        if (columns && columns.length > 0) {
          console.log(Object.keys(columns[0]));
        } else {
          console.log('Table exists but no data found');
        }
        
        // Check for missing columns
        const requiredColumns = ['twitch_id', 'username', 'display_name', 'is_live', 'votes'];
        let missingColumns = [];
        
        if (columns && columns.length > 0) {
          const actualColumns = Object.keys(columns[0]);
          missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));
        }
        
        if (missingColumns.length > 0) {
          console.log(`Warning: Missing columns: ${missingColumns.join(', ')}`);
          console.log('Will attempt to seed with available columns only');
        }
      } else {
        throw error;
      }
    } else {
      console.log('Schema check completed successfully');
    }
  } catch (error) {
    console.error('Error fixing schema:', error.message);
    console.log('Will attempt to continue anyway...');
  }
}

/**
 * Seeds the database with sample Twitch streamers
 */
async function seedTwitchStreamers() {
  console.log('Starting to seed Twitch streamers...');
  
  try {
    // Fix schema issues first
    await fixSchema();
    
    // Get available columns to ensure we only insert valid columns
    let availableColumns = [];
    try {
      const { data, error } = await supabase
        .from('twitch_streamers')
        .select('*')
        .limit(1);
        
      if (!error && data && data.length > 0) {
        availableColumns = Object.keys(data[0]);
      } else {
        // If we can't get columns, let's just try with our data as is
        console.log('Could not determine table columns, will attempt insert with sample data');
      }
    } catch (e) {
      console.log('Error checking table columns:', e.message);
    }
    
    // First check if we already have streamers
    const { data: existingStreamers, error: checkError } = await supabase
      .from('twitch_streamers')
      .select('id')
      .limit(1);
      
    if (checkError) {
      throw checkError;
    }
    
    // If we already have data, ask for confirmation before overwriting
    if (existingStreamers && existingStreamers.length > 0) {
      console.log('Database already contains streamer data. Skipping seed to prevent duplication.');
      console.log('Use --force flag to override.');
      
      // If --force is provided as an argument, continue anyway
      if (!process.argv.includes('--force')) {
        return;
      }
      console.log('Force flag detected. Proceeding with seed...');
    }
    
    console.log('Inserting sample streamers into database...');
    
    // Filter sample streamers to only include available columns
    let streamersToInsert = sampleStreamers;
    
    if (availableColumns.length > 0) {
      streamersToInsert = sampleStreamers.map(streamer => {
        const filteredStreamer = {};
        for (const key of availableColumns) {
          if (key in streamer) {
            filteredStreamer[key] = streamer[key];
          }
        }
        return filteredStreamer;
      });
    }
    
    // Insert sample streamers
    const { data, error } = await supabase
      .from('twitch_streamers')
      .upsert(streamersToInsert, { 
        onConflict: 'twitch_id',
        ignoreDuplicates: false
      })
      .select();
      
    if (error) {
      throw error;
    }
    
    console.log(`Successfully seeded ${data.length} streamers into the database!`);
    console.log('Sample streamer data:', data[0]);
    
  } catch (error) {
    console.error('Error seeding Twitch streamers:', error.message);
  }
}

// Run the seed function
seedTwitchStreamers()
  .then(() => {
    console.log('Seed process complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Seed process failed:', err);
    process.exit(1);
  });
