import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import XpProgressBar from './XpProgressBar';
import GemBalanceDisplay from './GemBalanceDisplay';
import AchievementDisplay from './AchievementDisplay';
import DailyChallenges from './DailyChallenges';
import { useAuth } from '../hooks/AuthProvider';
import { useGamification } from '../hooks/useGamification';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { progression } = useGamification();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (!error && data) {
          setIsAdmin(true);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [user]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const toggleProfileMenu = () => {
    setShowProfileMenu(!showProfileMenu);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close mobile menu when clicking outside
      if (isOpen && 
          menuRef.current && 
          !menuRef.current.contains(event.target) &&
          !hamburgerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
      
      // Close profile menu when clicking outside
      if (showProfileMenu && 
          profileMenuRef.current && 
          !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    // Close menus on ESC key
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    
    // Lock body scroll when menu is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, showProfileMenu]);

  const mainNavLinks = (
    <>
      <Link to="/" onClick={() => setIsOpen(false)}>Discover</Link>
      <Link to="/dig-deeper" onClick={() => setIsOpen(false)}>Dig Deeper</Link>
      <Link to="/leaderboard" onClick={() => setIsOpen(false)}>Leaderboard</Link>
      <Link to="/credits" onClick={() => setIsOpen(false)}>Credits</Link>
      {isAdmin && (
        <Link to="/admin" onClick={() => setIsOpen(false)} className="admin-link">
          Admin
        </Link>
      )}
    </>
  );

  const profileMenuLinks = (
    <>
      <Link to="/profile" onClick={() => { setShowProfileMenu(false); setIsOpen(false); }}>Profile</Link>
      <Link to="/settings" onClick={() => { setShowProfileMenu(false); setIsOpen(false); }}>Settings</Link>
      <button 
        onClick={() => { handleLogout(); setShowProfileMenu(false); setIsOpen(false); }} 
        className="logout-button"
      >
        Logout
      </button>
    </>
  );

  const authLinks = (
    <>
      <Link to="/login" onClick={() => setIsOpen(false)}>Login</Link>
      <Link to="/signup" onClick={() => setIsOpen(false)} className="signup-button">
        Sign Up
      </Link>
    </>
  );

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">
          <Link to="/" className="logo" onClick={() => setIsOpen(false)}>
            chadder.<span>ai</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="nav-links">
          {mainNavLinks}
        </div>

        {/* User profile section - desktop */}
        {user ? (
          <div className="user-profile-section">
            {/* XP and Gems Display - Only show when logged in */}
            <div className="nav-gamification">
              <XpProgressBar />
              <GemBalanceDisplay />
            </div>

            <div className="profile-menu-container" ref={profileMenuRef}>
              <button 
                className="profile-button" 
                onClick={toggleProfileMenu}
                aria-label="Toggle profile menu"
                aria-expanded={showProfileMenu}
              >
                <div className="level-indicator">
                  <span>{progression?.level || 1}</span>
                </div>
                <div className="profile-info">
                  <span className="profile-name">{user.email.split('@')[0]}</span>
                </div>
              </button>

              {showProfileMenu && (
                <div className="profile-dropdown">
                  {profileMenuLinks}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="nav-auth-links">
            {authLinks}
          </div>
        )}

        {/* Mobile Navigation */}
        <button 
          ref={hamburgerRef}
          className={`hamburger ${isOpen ? 'active' : ''}`} 
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div 
          ref={menuRef}
          className={`navbar-menu ${isOpen ? 'active' : ''}`}
          aria-hidden={!isOpen}
        >
          {user && (
            <div className="mobile-profile-section">
              <div className="mobile-profile-header">
                <div className="level-indicator">
                  <span>{progression?.level || 1}</span>
                </div>
                <div className="profile-info">
                  <span className="profile-name">{user.email.split('@')[0]}</span>
                </div>
              </div>
              <div className="mobile-gamification">
                <XpProgressBar />
                <GemBalanceDisplay />
              </div>
            </div>
          )}
          
          <div className="mobile-nav-links">
            {mainNavLinks}
            {user ? profileMenuLinks : authLinks}
          </div>
        </div>
      </nav>
      
      {/* Achievement popups system */}
      {user && <AchievementDisplay />}
      
      {/* Daily challenges floating panel */}
      {user && <DailyChallenges />}
    </>
  );
};

export default Navbar; 