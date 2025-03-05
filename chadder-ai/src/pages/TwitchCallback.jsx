import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleTwitchCallback } from '../utils/twitchAuth';

const TwitchCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        
        // Verify state matches what we stored
        const storedState = sessionStorage.getItem('twitch_auth_state');
        if (state !== storedState) {
          throw new Error('State mismatch');
        }

        const accessToken = await handleTwitchCallback(code);
        localStorage.setItem('twitch_access_token', accessToken);
        
        // Clean up
        sessionStorage.removeItem('twitch_auth_state');
        sessionStorage.removeItem('twitch_code_verifier');
        
        navigate('/'); // or wherever you want to redirect after auth
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/error');
      }
    };

    handleAuth();
  }, [location, navigate]);

  return <div>Authenticating...</div>;
};

export default TwitchCallback; 