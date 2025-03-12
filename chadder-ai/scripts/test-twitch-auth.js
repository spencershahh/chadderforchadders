// Simple script to test Twitch API authentication
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Twitch API credentials 
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Validate credentials are available
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
  console.error('ERROR: Missing Twitch API credentials. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables.');
  process.exit(1);
}

console.log('Testing Twitch API authentication with:');
console.log('Client ID first 5 chars:', TWITCH_CLIENT_ID.substring(0, 5) + '...');
console.log('Client Secret length:', TWITCH_CLIENT_SECRET.length);

async function testTwitchAuth() {
  try {
    console.log('Attempting to get Twitch access token...');
    
    // Method 1: Using URL parameters
    console.log('\nMethod 1: URL parameters');
    try {
      const response1 = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          grant_type: 'client_credentials'
        }
      });
      console.log('SUCCESS Method 1! Got access token:', response1.data.access_token.substring(0, 10) + '...');
    } catch (error) {
      console.error('Method 1 FAILED:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
    }
    
    // Method 2: Using form data
    console.log('\nMethod 2: Form data');
    try {
      const params = new URLSearchParams();
      params.append('client_id', TWITCH_CLIENT_ID);
      params.append('client_secret', TWITCH_CLIENT_SECRET);
      params.append('grant_type', 'client_credentials');
      
      const response2 = await axios.post('https://id.twitch.tv/oauth2/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      console.log('SUCCESS Method 2! Got access token:', response2.data.access_token.substring(0, 10) + '...');
    } catch (error) {
      console.error('Method 2 FAILED:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
    }
    
    // Method 3: Using JSON
    console.log('\nMethod 3: JSON');
    try {
      const response3 = await axios.post('https://id.twitch.tv/oauth2/token', {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      });
      console.log('SUCCESS Method 3! Got access token:', response3.data.access_token.substring(0, 10) + '...');
    } catch (error) {
      console.error('Method 3 FAILED:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
    }
    
  } catch (error) {
    console.error('General error:', error.message);
  }
}

testTwitchAuth(); 