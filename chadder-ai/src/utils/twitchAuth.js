const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';
const REDIRECT_URI = 'https://chadderai.vercel.app/auth/twitch/callback';

// Generate random string for state
function generateState() {
  return Math.random().toString(36).substring(2, 15);
}

// Generate code verifier
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

// Generate code challenge
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function initiateTwitchAuth() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store these in sessionStorage
  sessionStorage.setItem('twitch_auth_state', state);
  sessionStorage.setItem('twitch_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'user:read:email channel:read:subscriptions',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params}`;
}

export async function handleTwitchCallback(code) {
  const codeVerifier = sessionStorage.getItem('twitch_code_verifier');
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      code_verifier: codeVerifier,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    })
  });

  const data = await response.json();
  return data.access_token;
} 