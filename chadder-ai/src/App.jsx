import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import GlowEffect from './components/GlowEffect';
import Navbar from './components/Navbar';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Pages
import Discover from "./pages/Discover";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import StreamPage from "./pages/StreamPage";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import CreditsPage from './pages/CreditsPage';

import "./App.css";

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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
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

  if (!stripeKey) {
    return <div>Error: Stripe key not configured</div>;
  }

  return (
    <Elements stripe={stripePromise}>
      <Router>
        <div className="app-container">
          <Toaster position="top-right" />
          <GlowEffect />
          <Navbar user={user} onLogout={handleLogout} />
          <div className="main-content">
            <Routes>
              <Route path="/" element={<Discover />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/credits" element={<CreditsPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/stream/:username" element={<StreamPage />} />
            </Routes>
          </div>
        </div>
      </Router>
    </Elements>
  );
};

export default App;