import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from 'react-hot-toast';
import "../App.css";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [hash, setHash] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Extract the hash from the URL that Supabase sent
    const urlHash = window.location.hash;
    if (urlHash) {
      // The hash typically looks like #access_token=...&type=recovery
      setHash(urlHash);
    }
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setLoading(true);
    
    try {
      // If we have a hash from the recovery link, we're updating the password after a reset
      if (hash) {
        const { error } = await supabase.auth.updateUser({ password });
        
        if (error) {
          throw error;
        }
        
        toast.success("Password updated successfully!");
        // Redirect to login page after a successful reset
        setTimeout(() => navigate("/login"), 2000);
      } else {
        toast.error("Invalid password reset link. Please request a new one.");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <Toaster position="top-center" />
      <h2 className="auth-title">Reset Your Password</h2>
      <form className="auth-form" onSubmit={handleResetPassword}>
        <input
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="auth-input"
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="auth-input"
        />
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Updating..." : "Reset Password"}
        </button>
      </form>
      <p className="auth-switch">
        Remember your password? <a href="/login">Log In</a>
      </p>
    </div>
  );
};

export default ResetPassword; 