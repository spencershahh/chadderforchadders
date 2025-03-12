import { config } from 'dotenv';
import axios from 'axios';

// Load environment variables
config();

// Get Twitch credentials from environment variables
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

console.log('=== Twitch API Credential Verification ===');

// Validate credentials
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
  console.error('ERROR: Missing Twitch API credentials. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables.');
  process.exit(1);
}

console.log('Client ID first 5 chars:', TWITCH_CLIENT_ID.substring(0, 5) + '...');
console.log('Client Secret length:', TWITCH_CLIENT_SECRET.length);

async function verifyTwitchCredentials() {
  try {
    // Method 1: Using form data format (most reliable)
    console.log('\nTesting Twitch Authentication...');
    
    const params = new URLSearchParams();
    params.append('client_id', TWITCH_CLIENT_ID);
    params.append('client_secret', TWITCH_CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');
    
    const response = await axios.post('https://id.twitch.tv/oauth2/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (response.data && response.data.access_token) {
      console.log('✅ Authentication successful!');
      console.log('Access token:', response.data.access_token.substring(0, 10) + '...');
      console.log('Token expires in:', response.data.expires_in, 'seconds');
      
      // Test a simple Twitch API call to verify the token works
      console.log('\nTesting API call with this token...');
      
      const apiResponse = await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
          'Authorization': `Bearer ${response.data.access_token}`,
          'Client-Id': TWITCH_CLIENT_ID
        },
        params: {
          login: 'shroud'  // Testing with a popular streamer
        }
      });
      
      if (apiResponse.data && apiResponse.data.data) {
        console.log('✅ API call successful!');
        console.log('Retrieved data for:', apiResponse.data.data.length, 'users');
        console.log('Your Twitch credentials are working properly!');
      }
    }
  } catch (error) {
    console.log('❌ Verification failed!');
    console.error('Error details:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 400 && error.response.data.message === 'invalid client') {
        console.error('\n⚠️  Your client ID or client secret appears to be invalid!');
        console.error('Please verify your credentials in the Twitch Developer Console.');
      }
    }
  }
}

verifyTwitchCredentials(); 