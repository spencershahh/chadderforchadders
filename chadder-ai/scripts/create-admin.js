#!/usr/bin/env node

/**
 * Script to create an admin user in Supabase
 * 
 * Usage: 
 * 1. Copy .env.example to .env and fill in your Supabase credentials
 * 2. Run: node scripts/create-admin.js user@email.com
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:');
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env file');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const createAdmin = async (email) => {
  try {
    // First, find the user by email
    const { data: userData, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') {
        console.error(`User with email "${email}" not found.`);
        return;
      }
      throw userError;
    }

    // Fallback: Use supabase auth API to get user
    if (!userData) {
      const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserByEmail(email);
      
      if (authUserError) {
        throw authUserError;
      }
      
      if (!authUser) {
        console.error(`User with email "${email}" not found.`);
        return;
      }
      
      userData = authUser;
    }

    // Check if user is already an admin
    const { data: existingAdmin, error: adminCheckError } = await supabase
      .from('admins')
      .select('*')
      .eq('user_id', userData.id)
      .single();

    if (!adminCheckError && existingAdmin) {
      console.log(`User "${email}" is already an admin.`);
      return;
    }

    // Make the user an admin
    const { data: newAdmin, error: insertError } = await supabase
      .from('admins')
      .insert([
        { user_id: userData.id }
      ]);

    if (insertError) {
      throw insertError;
    }

    console.log(`Successfully made user "${email}" an admin!`);
  } catch (error) {
    console.error('Error creating admin:', error.message);
  }
};

// Main execution
const main = async () => {
  const email = process.argv[2];

  if (!email) {
    console.error('Please provide an email address.');
    console.error('Usage: node scripts/create-admin.js user@email.com');
    process.exit(1);
  }

  await createAdmin(email);
  process.exit(0);
};

main(); 