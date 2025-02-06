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
import AdminDashboard from './pages/AdminDashboard';

import "./App.css";

console.log('Stripe Key:', import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.error('Stripe publishable key is missing!');
}

const stripePromise = loadStripe(stripeKey);

const App = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user || null);
      
      if (data?.session?.user) {
        // Check if user is admin
        const { data: userData } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', data.session.user.id)
          .single();
        
        setIsAdmin(!!userData?.is_admin);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user || null);
      
      if (session?.user) {
        // Check if user is admin
        const { data: userData } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        
        setIsAdmin(!!userData?.is_admin);
      } else {
        setIsAdmin(false);
      }
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
              <Route
                path="/profile"
                element={
                  <ProtectedRoute user={user}>
                    <Profile user={user} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute user={user}>
                    <Settings user={user} />
                  </ProtectedRoute>
                }
              />
              <Route path="/credits" element={<CreditsPage user={user} />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/stream/:username" element={<StreamPage user={user} />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute user={user}>
                    {isAdmin ? <AdminDashboard /> : <div>Access Denied</div>}
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </Router>
    </Elements>
  );
};

export default App;