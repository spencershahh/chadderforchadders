// This script can be run to seed your database with sample Twitch streamers
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Replace with your Supabase credentials from .env file
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Sample data for Twitch streamers
const sampleStreamers = [
  {
    twitch_id: '12345',
    username: 'ninja',
    display_name: 'Ninja',
    description: 'Professional gamer, streamer, and content creator.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/ninja-profile_image-0c5c5fdc533b8dec-300x300.png',
    view_count: 500000,
    votes: 120
  },
  {
    twitch_id: '23456',
    username: 'pokimane',
    display_name: 'pokimane',
    description: 'Variety streamer who plays games like Valorant, League of Legends, and more.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/pokimane-profile_image-5abdd0daf3015e1a-300x300.png',
    view_count: 300000,
    votes: 95
  },
  {
    twitch_id: '34567',
    username: 'shroud',
    display_name: 'shroud',
    description: 'Former professional CS:GO player known for his aim in FPS games.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/shroud-profile_image-630aac18fb138410-300x300.png',
    view_count: 450000,
    votes: 110
  },
  {
    twitch_id: '45678',
    username: 'timthetatman',
    display_name: 'TimTheTatman',
    description: 'Variety streamer known for his entertaining personality and gameplay.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/timthetatman-profile_image-2b9a0d4a669e4b35-300x300.png',
    view_count: 250000,
    votes: 80
  },
  {
    twitch_id: '56789',
    username: 'drdisrespect',
    display_name: 'DrDisrespect',
    description: 'The Two-Time Champion with a unique streaming persona.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/drdisrespect-profile_image-abc1fc67d2ea1ae5-300x300.png',
    view_count: 350000,
    votes: 100
  },
  {
    twitch_id: '67890',
    username: 'xqc',
    display_name: 'xQc',
    description: 'Former Overwatch pro player known for his fast-paced content and reactions.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/xqc-profile_image-9298dca608632101-300x300.jpeg',
    view_count: 400000,
    votes: 115
  },
  {
    twitch_id: '78901',
    username: 'lirik',
    display_name: 'LIRIK',
    description: 'One of Twitch\'s most popular variety streamers.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/lirik-profile_image-fbf6645260fe6425-300x300.jpeg',
    view_count: 280000,
    votes: 90
  },
  {
    twitch_id: '89012',
    username: 'nickmercs',
    display_name: 'NICKMERCS',
    description: 'FPS gamer known for competitive Call of Duty and Apex Legends gameplay.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/nickmercs-profile_image-abb27658aed02bda-300x300.jpeg',
    view_count: 320000,
    votes: 95
  },
  {
    twitch_id: '90123',
    username: 'amouranth',
    display_name: 'Amouranth',
    description: 'Content creator, cosplayer, and variety streamer.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/amouranth-profile_image-f78654b4224fc918-300x300.png',
    view_count: 200000,
    votes: 75
  },
  {
    twitch_id: '01234',
    username: 'sodapoppin',
    display_name: 'Sodapoppin',
    description: 'Veteran Twitch streamer known for his variety content and gaming.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/sodapoppin-profile_image-b317c5fad380a847-300x300.jpeg',
    view_count: 270000,
    votes: 85
  },
  // Add smaller streamers to discover
  {
    twitch_id: '11223',
    username: 'cohhcarnage',
    display_name: 'CohhCarnage',
    description: 'Variety streamer focused on RPGs and story-driven games.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/cohhcarnage-profile_image-96d2be1e77af8ec9-300x300.png',
    view_count: 150000,
    votes: 50
  },
  {
    twitch_id: '22334',
    username: 'disguisedtoast',
    display_name: 'DisguisedToast',
    description: 'Strategic gamer known for Among Us and Hearthstone content.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/disguisedtoast-profile_image-1c8d25cd50687521-300x300.jpeg',
    view_count: 180000,
    votes: 60
  },
  {
    twitch_id: '33445',
    username: 'hasanabi',
    display_name: 'HasanAbi',
    description: 'Political commentator and variety streamer.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/hasanabi-profile_image-1e9beff336957109-300x300.png',
    view_count: 160000,
    votes: 55
  },
  {
    twitch_id: '44556',
    username: 'summit1g',
    display_name: 'summit1g',
    description: 'Former CS:GO pro, now a variety streamer.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/summit1g-profile_image-afa03e995e5f7821-300x300.jpeg',
    view_count: 190000,
    votes: 65
  },
  {
    twitch_id: '55667',
    username: 'kitboga',
    display_name: 'Kitboga',
    description: 'Scam baiter who calls scammers to waste their time and educate viewers.',
    profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/kitboga-profile_image-a8de2f1188c0b361-300x300.png',
    view_count: 120000,
    votes: 45
  }
];

// Function to seed streamers
async function seedTwitchStreamers() {
  try {
    console.log('Seeding Twitch streamers...');
    
    // Insert data into twitch_streamers table
    const { data, error } = await supabase
      .from('twitch_streamers')
      .upsert(sampleStreamers, { onConflict: 'twitch_id' });
      
    if (error) {
      console.error('Error seeding data:', error);
      return;
    }
    
    console.log('Successfully seeded Twitch streamers!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the seed function
seedTwitchStreamers(); 