import { useState, useEffect } from 'react';

export const TwitchConfigTest = () => {
  const [config, setConfig] = useState({
    clientIdExists: false,
    clientSecretExists: false,
    clientIdPrefix: '',
    error: null
  });

  useEffect(() => {
    try {
      // Safe way to access environment variables
      const clientId = import.meta.env?.VITE_TWITCH_CLIENT_ID || '';
      const clientSecret = import.meta.env?.VITE_TWITCH_CLIENT_SECRET || '';
      
      setConfig({
        clientIdExists: !!clientId,
        clientSecretExists: !!clientSecret,
        clientIdPrefix: clientId ? clientId.substring(0, 3) + '...' : 'not-set',
        error: null
      });
    } catch (error) {
      setConfig({
        clientIdExists: false,
        clientSecretExists: false,
        clientIdPrefix: '',
        error: error.message
      });
    }
  }, []);

  return (
    <div style={{ padding: '20px', background: '#222', color: '#fff', borderRadius: '8px', margin: '20px 0' }}>
      <h3>Twitch API Configuration Test</h3>
      {config.error ? (
        <div style={{ color: 'red' }}>Error: {config.error}</div>
      ) : (
        <div>
          <p>Client ID available: <span style={{ color: config.clientIdExists ? 'green' : 'red' }}>{config.clientIdExists ? 'Yes' : 'No'}</span></p>
          <p>Client Secret available: <span style={{ color: config.clientSecretExists ? 'green' : 'red' }}>{config.clientSecretExists ? 'Yes' : 'No'}</span></p>
          {config.clientIdExists && <p>Client ID starts with: {config.clientIdPrefix}</p>}
        </div>
      )}
    </div>
  );
};

export default TwitchConfigTest; 