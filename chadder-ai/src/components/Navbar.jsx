import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './Navbar.css';

const Navbar = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/');
      window.location.reload(); // Force reload to clear all states
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && 
          menuRef.current && 
          !menuRef.current.contains(event.target) &&
          !hamburgerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Close menu on ESC key
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
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
  }, [isOpen]);

  const navLinks = (
    <>
      <Link to="/" onClick={() => setIsOpen(false)}>Discover</Link>
      <Link to="/dig-deeper" onClick={() => setIsOpen(false)}>Dig Deeper</Link>
      <Link to="/leaderboard" onClick={() => setIsOpen(false)}>Leaderboard</Link>
      <Link to="/credits" onClick={() => setIsOpen(false)}>Credits</Link>
      <Link to="/settings" onClick={() => setIsOpen(false)}>Settings</Link>
      {user ? (
        <button 
          onClick={handleLogout} 
          className="logout-button"
        >
          Logout
        </button>
      ) : (
        <>
          <Link to="/login" onClick={() => setIsOpen(false)}>Login</Link>
          <Link to="/signup" onClick={() => setIsOpen(false)} className="signup-button">
            Sign Up
          </Link>
        </>
      )}
    </>
  );

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="logo" onClick={() => setIsOpen(false)}>
          chadder.<span>ai</span>
        </Link>
      </div>

      {/* Desktop Navigation */}
      <div className="nav-links">
        {navLinks}
      </div>

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
        {navLinks}
      </div>
    </nav>
  );
};

export default Navbar; 