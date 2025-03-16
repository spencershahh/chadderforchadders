import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import GlowEffect from './components/GlowEffect';
import Navbar from './components/Navbar';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import TwitchCallback from './pages/TwitchCallback';

// In your router setup:
<Route path="/auth/twitch/callback" element={<TwitchCallback />} /> 

// Pages
import Discover from "./pages/Discover";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import StreamPage from "./pages/StreamPage";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import GemsPage from './pages/GemsPage';
import CreditsPage from './pages/CreditsPage';
import AdminDashboard from './pages/AdminDashboard';

import "./App.css";

// Simple test component for debugging routing issues
const SettingsTest = () => {
  return (
    <div style={{
      padding: '40px',
      maxWidth: '800px',
      margin: '0 auto',
      color: 'white'
    }}>
      <h1>Settings Test Page</h1>
      <p>This is a test page to check if routing is working properly.</p>
      <p>If you can see this, the routing is working but there might be an issue with the actual Settings component.</p>
      <div style={{marginTop: '20px'}}>
        <button 
          style={{
            background: '#9147ff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={() => {
            try {
              console.log('Auth state:', supabase.auth.session());
              
              // Try a simple query
              supabase.from('users').select('id').limit(1)
                .then(result => console.log('Test query result:', result))
                .catch(err => console.error('Test query error:', err));
                
            } catch (err) {
              console.error('Error checking auth:', err);
            }
          }}
        >
          Test Supabase Connection
        </button>
      </div>
    </div>
  );
};

console.log('Stripe Key:', import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.error('Stripe publishable key is missing!');
}

const stripePromise = loadStripe(stripeKey);

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <Router>
      <div className="app">
        <GlowEffect />
        <Toaster position="top-center" />
        <Navbar user={user} onLogout={handleLogout} />
        <Elements stripe={stripePromise}>
          <Routes>
            <Route path="/" element={<Discover />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/stream/:username" element={<StreamPage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/gems" element={<GemsPage />} />
            <Route path="/credits" element={<CreditsPage />} />
            <Route path="/auth/twitch/callback" element={<TwitchCallback />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/profile" element={<Profile />} />
              {/* Temporarily use test component for debugging */}
              <Route path="/settings" element={<SettingsTest />} />
              {/* Comment out original settings route temporarily */}
              {/* <Route path="/settings" element={<Settings />} /> */}
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Routes>
        </Elements>
      </div>
    </Router>
  );
};

export default App;