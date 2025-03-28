import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupAdminDatabase() {
  try {
    console.log('Setting up admin database...');

    // Create admins table
    const { error: adminsError } = await supabase.rpc('create_admins_table', {});
    if (adminsError) {
      console.error('Error creating admins table:', adminsError);
      return;
    }
    console.log('✓ Admins table created');

    // Create streamers table
    const { error: streamersError } = await supabase.rpc('create_streamers_table', {});
    if (streamersError) {
      console.error('Error creating streamers table:', streamersError);
      return;
    }
    console.log('✓ Streamers table created');

    // Create RLS policies
    const { error: policiesError } = await supabase.rpc('create_admin_policies', {});
    if (policiesError) {
      console.error('Error creating policies:', policiesError);
      return;
    }
    console.log('✓ RLS policies created');

    console.log('Database setup completed successfully!');
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupAdminDatabase(); 