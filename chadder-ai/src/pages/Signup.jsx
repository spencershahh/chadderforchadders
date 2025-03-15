import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import { FaTrophy, FaUsers, FaStream, FaPlay, FaArrowRight } from 'react-icons/fa';
import { fetchStreamers } from "../api/twitch";
import "../App.css";
import "./Signup.css"; // We'll create this file later

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [totalStreamers, setTotalStreamers] = useState(0);
  const [liveStreamers, setLiveStreamers] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [popularStreamers, setPopularStreamers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch real stats and streamers for the teaser section
  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        // Fetch streamers data
        const streamersData = await fetchStreamers();
        
        if (streamersData && streamersData.length > 0) {
          // Set total and live streamers count
          setTotalStreamers(streamersData.length);
          setLiveStreamers(streamersData.filter(s => s.type === "live").length);
          
          // Get the top 3 streamers by viewer count for the popular section
          const sortedStreamers = [...streamersData]
            .sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0))
            .filter(s => s.type === "live")
            .slice(0, 3);
            
          setPopularStreamers(sortedStreamers);
        }
        
        // Fetch the prize pool amount
        const { data: donationAmount, error: donationError } = await supabase
          .rpc('calculate_weekly_donation_bomb');
          
        if (!donationError) {
          setPrizePool(donationAmount || 0);
        } else {
          console.error('Error calculating donation bomb:', donationError);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        // If there's an error, use backup data as fallback
        setTotalStreamers(100);
        setLiveStreamers(35);
        setPrizePool(1500.75);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, []);

  const checkExistingUser = async (email) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error("Error checking existing user:", error);
      return null;
    }
    
    return data;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate display name
      if (!displayName.trim()) {
        toast.error('Display name is required');
        setLoading(false);
        return;
      }

      // Check if display name is available using our new function
      const { data: isAvailable, error: checkError } = await supabase
        .rpc('is_username_available', {
          p_display_name: displayName
        });

      if (checkError) {
        toast.error(`Error checking display name: ${checkError.message}`);
        setLoading(false);
        return;
      }

      if (!isAvailable) {
        toast.error('Display name is not available');
        setLoading(false);
        return;
      }

      // Check for existing user with this email in the database
      const { data: existingDbUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingDbUser) {
        // Delete the existing user from the database
        await supabase
          .from('users')
          .delete()
          .eq('id', existingDbUser.id);
      }

      // Get site URL for email confirmation
      const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;

      // Sign up the user with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          },
          emailRedirectTo: `${siteUrl}/login`
        }
      });

      if (error) {
        console.error("Signup error:", error.message);
        toast.error(`Signup error: ${error.message}`);
        setLoading(false);
        return;
      }

      const user = data.user;
      console.log("Supabase auth signup response:", data);

      if (user) {
        // Wait a short moment to ensure any cascading deletes have completed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try upserting the new user record to avoid duplicate key error if record exists
        const { error: upsertError } = await supabase
          .from('users')
          .upsert([
            {
              id: user.id,
              email: user.email,
              display_name: displayName,
              tier: 'free',
              credits: 0,
              created_at: new Date().toISOString()
            }
          ], { onConflict: 'id' });

        if (upsertError) {
          console.error("Database upsert error:", upsertError);
          toast.error(`Failed to create account: ${upsertError.message}`);
          setLoading(false);
          return;
        }

        toast.success('Signup successful! Please check your email to confirm your account.', {
          duration: 5000,
          onClose: () => navigate("/login")
        });
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(`Unexpected error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Generate avatar initials for streamers without profile images
  const getStreamerInitials = (name) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="signup-container">
      <Toaster position="top-center" />
      
      {/* Teaser Section */}
      <div className="teaser-container">
        <div className="teaser-content">
          <div className="teaser-header">
            <h1 className="teaser-title">Welcome to Chadder.ai</h1>
            <p className="teaser-subtitle">Discover and support emerging streamers</p>
          </div>
          
          <div className="teaser-features">
            <div className="teaser-feature">
              <FaUsers className="teaser-icon" />
              <div className="feature-text">
                <h3>Find Great Streamers</h3>
                <p>Discover hidden talent and emerging content creators</p>
              </div>
            </div>
            
            <div className="teaser-feature">
              <FaStream className="teaser-icon" />
              <div className="feature-text">
                <h3>Support Your Favorites</h3>
                <p>Vote for streamers you love and help them win prizes</p>
              </div>
            </div>
            
            <div className="teaser-feature">
              <FaTrophy className="teaser-icon" />
              <div className="feature-text">
                <h3>Weekly Prize Pools</h3>
                <p>Your votes help streamers win real money prizes every week</p>
              </div>
            </div>
          </div>
          
          <div className="teaser-stats">
            <div className="stat-item">
              <span className="stat-number">{dataLoading ? '...' : totalStreamers}</span>
              <span className="stat-label">Total Streamers</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{dataLoading ? '...' : liveStreamers}</span>
              <span className="stat-label">Live Now</span>
            </div>
            <div className="stat-item prize-pool">
              <span className="stat-number">
                <span className="currency">$</span>
                {dataLoading ? '...' : prizePool.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="stat-label">Current Prize Pool</span>
            </div>
          </div>

          {/* Popular Streamers Section */}
          <div className="popular-streamers-section">
            <h3 className="popular-streamers-title">Popular Streamers This Week</h3>
            {dataLoading ? (
              <div className="loading-streamers">
                <div className="loading-streamer-card"></div>
                <div className="loading-streamer-card"></div>
                <div className="loading-streamer-card"></div>
              </div>
            ) : (
              <div className="popular-streamers-grid">
                {popularStreamers.map(streamer => (
                  <div key={streamer.user_id} className="popular-streamer-card">
                    <div 
                      className="popular-streamer-avatar"
                      style={streamer.profile_image_url ? {
                        backgroundImage: `url(${streamer.profile_image_url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        color: 'transparent'
                      } : {}}
                    >
                      {!streamer.profile_image_url && getStreamerInitials(streamer.user_name)}
                    </div>
                    <div className="popular-streamer-info">
                      <span className="popular-streamer-name">{streamer.user_name}</span>
                      <span className="popular-streamer-game">{streamer.game_name || 'Streaming'}</span>
                      {streamer.type === "live" && (
                        <div className="mini-stats">
                          <span className="mini-live-badge">LIVE</span>
                          <span className="mini-viewers">{streamer.viewer_count?.toLocaleString() || 0} viewers</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="see-all-streamers">
              <p>Create an account to see all streamers</p>
              <FaArrowRight className="arrow-icon" />
            </div>
          </div>

          {/* Video Demo Section */}
          <div className="video-demo-section">
            <h3 className="video-demo-title">See how Chadder.ai works</h3>
            
            {showVideo ? (
              <div className="video-player">
                {/* Replace this with your actual video embed code */}
                <iframe 
                  className="demo-video"
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID" 
                  title="Chadder.ai Demo"
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
                <button 
                  className="close-video-btn"
                  onClick={() => setShowVideo(false)}
                >
                  Close Video
                </button>
              </div>
            ) : (
              <div 
                className="video-thumbnail"
                onClick={() => setShowVideo(true)}
              >
                <div className="play-button-wrapper">
                  <FaPlay className="play-button-icon" />
                </div>
                <div className="video-thumbnail-overlay">
                  <p>Click to watch our 1-minute demo</p>
                </div>
              </div>
            )}
          </div>

          <div className="preview-image">
            {/* You can add an image or video preview here */}
            <div className="placeholder-image">
              <div className="streamer-card-preview">
                <div className="preview-thumbnail">
                  <div className="live-badge">LIVE</div>
                </div>
                <div className="preview-info">
                  <div className="preview-profile"></div>
                  <div className="preview-details">
                    <div className="preview-name"></div>
                    <div className="preview-game"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Signup Form Section */}
      <div className="auth-container">
        <h2 className="auth-title">Sign Up for Chadder.ai</h2>
        <p className="auth-description">Join our community and help support emerging streamers</p>
        <form className="auth-form" onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="auth-input"
          />
          <button type="submit" disabled={loading} className="auth-button">
            {loading ? "Signing up..." : "Sign Up"}
          </button>
          <p className="terms-text">
            By signing up, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>
          </p>
        </form>
        <p className="auth-switch">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  );
};

export default Signup;