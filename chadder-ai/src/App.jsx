import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import GlowEffect from './components/GlowEffect';

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

  return (
    <Router>
      <div className="app-container">
        <Toaster position="top-right" />
        <GlowEffect />
        <nav className="navbar">
          <div className="navbar-logo">
            <Link to="/">chadder.<span>ai</span></Link>
          </div>
          <div className="navbar-links">
            <Link to="/" className="nav-item">Discover</Link>
            <Link to="/leaderboard" className="nav-item">Leaderboard</Link>
            <Link to="/credits" className="nav-item">Credits</Link>
            <Link to="/settings" className="nav-item">Settings</Link>
            {user ? (
              <button 
                onClick={handleLogout} 
                className="nav-item logout-button"
                style={{ color: '#FFFFFF' }}
              >
                Logout
              </button>
            ) : (
              <>
                <Link to="/login" className="nav-item">Login</Link>
                <Link to="/signup" className="nav-item signup-button">Sign Up</Link>
              </>
            )}
          </div>
        </nav>
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
  );
};

export default App;