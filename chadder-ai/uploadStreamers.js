import 'dotenv/config'; // This automatically loads the .env file
import { createClient } from '@supabase/supabase-js';
import streamers from './src/data/streamers.json' assert { type: 'json' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const uploadStreamers = async () => {
  try {
    const { error } = await supabase.from('streamers').insert(
      streamers.map((streamer) => ({
        name: streamer.username,
        bio: streamer.bio,
        votes_count: 0,
      }))
    );

    if (error) {
      console.error('Error uploading streamers:', error);
    } else {
      console.log('Streamers uploaded successfully');
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
};

uploadStreamers();