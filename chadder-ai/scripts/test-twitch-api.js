// This script tests the Twitch API connection
import 'dotenv/config';
import axios from 'axios';
import fetch from 'node-fetch';

// Twitch API credentials from .env
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET;
const API_URL = process.env.VITE_API_URL || 'https://chadderforchadders.onrender.com';

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
  console.error('Error: Twitch API credentials missing. Please check your .env file');
  console.error('Required variables: VITE_TWITCH_CLIENT_ID, VITE_TWITCH_CLIENT_SECRET');
  process.exit(1);
}

console.log('========== TWITCH API DIAGNOSTICS ==========');
console.log('Twitch Client ID:', TWITCH_CLIENT_ID ? '✓ Found' : '✗ Missing');
console.log('Twitch Client Secret:', TWITCH_CLIENT_SECRET ? '✓ Found' : '✗ Missing');
console.log('API URL:', API_URL);
console.log('');

// Test getting an access token directly from Twitch
async function testDirectTokenFetch() {
  console.log('Testing direct token fetch from Twitch API...');
  try {
    const response = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
    );
    
    console.log('✓ Successfully obtained token directly from Twitch');
    console.log('Token expires in:', response.data.expires_in, 'seconds');
    
    return response.data.access_token;
  } catch (error) {
    console.error('✗ Error obtaining token directly from Twitch:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
    return null;
  }
}

// Test getting an access token from the backend
async function testBackendTokenFetch() {
  console.log('\nTesting token fetch from backend...');
  try {
    const response = await fetch(`${API_URL}/api/twitch/token`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✓ Successfully obtained token from backend');
    return data.access_token;
  } catch (error) {
    console.error('✗ Error obtaining token from backend:', error.message);
    return null;
  }
}

// Test fetching streamers from Twitch API
async function testStreamersData(accessToken, streamers) {
  console.log('\nTesting streamer data fetch...');
  
  if (!accessToken) {
    console.error('✗ Cannot test streamer data - no access token available');
    return;
  }
  
  // Test streamers - use a few sample ones if none provided
  const testStreamers = streamers || ['sodapoppin', 'ninja', 'shroud', 'pokimane', 'xqc'];
  
  try {
    console.log(`Testing with streamers: ${testStreamers.join(', ')}`);
    
    // Fetch user information
    const userResponse = await fetch(
      `https://api.twitch.tv/helix/users?${testStreamers.map(login => `login=${login}`).join('&')}`,
      {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (!userResponse.ok) {
      throw new Error(`HTTP error! status: ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();
    const users = userData.data;
    
    console.log(`✓ Successfully fetched data for ${users.length} out of ${testStreamers.length} streamers`);
    
    if (users.length === 0) {
      console.warn('⚠ No users found - check streamer usernames');
      return;
    }
    
    // Show detailed info for debugging
    console.log('\nStreamer details:');
    users.forEach(user => {
      console.log(`- ${user.display_name} (${user.login}): ID ${user.id}`);
    });
    
    // Test live streams data
    const userIds = users.map(user => user.id);
    
    console.log('\nChecking live streams...');
    const streamsResponse = await axios.get("https://api.twitch.tv/helix/streams", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
      },
      params: {
        user_id: userIds,
      },
    });
    
    const liveStreams = streamsResponse.data.data;
    console.log(`Live streamers: ${liveStreams.length}/${users.length}`);
    
    liveStreams.forEach(stream => {
      const streamer = users.find(u => u.id === stream.user_id);
      console.log(`- ${streamer?.display_name || stream.user_name} is live with ${stream.viewer_count} viewers playing ${stream.game_name || 'Unknown Game'}`);
    });
    
  } catch (error) {
    console.error('✗ Error fetching streamer data:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

// Run all tests
async function runTests() {
  try {
    // First try direct token
    let accessToken = await testDirectTokenFetch();
    
    // Then try backend token
    if (!accessToken) {
      console.log('\nDirect token fetch failed. Trying backend...');
      accessToken = await testBackendTokenFetch();
    }
    
    // Test with the token we got
    if (accessToken) {
      await testStreamersData(accessToken);
    } else {
      console.error('\n✗ All token fetch methods failed. Cannot proceed with API tests.');
    }
    
    console.log('\n========== DIAGNOSTICS COMPLETE ==========');
    
  } catch (error) {
    console.error('Unexpected error during tests:', error);
  }
}

runTests(); 