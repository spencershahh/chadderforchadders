import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function makeUserAdmin(email) {
  try {
    console.log(`Making user ${email} an admin...`);

    // First, get the user's ID
    const { data: userData, error: userError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError) {
      console.error('Error finding user:', userError);
      return;
    }

    if (!userData) {
      console.error('User not found');
      return;
    }

    // Check if user is already an admin
    const { data: existingAdmin, error: checkError } = await supabase
      .from('admins')
      .select('*')
      .eq('user_id', userData.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error checking admin status:', checkError);
      return;
    }

    if (existingAdmin) {
      console.log('User is already an admin');
      return;
    }

    // Make the user an admin
    const { error: insertError } = await supabase
      .from('admins')
      .insert([{ user_id: userData.id }]);

    if (insertError) {
      console.error('Error making user admin:', insertError);
      return;
    }

    console.log('Successfully made user an admin!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error('Please provide an email address');
  process.exit(1);
}

makeUserAdmin(email); 