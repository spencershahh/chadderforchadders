import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth'; // Assuming you have an auth hook
import { toast } from 'react-hot-toast'; // For notifications
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailUpdateLoading, setIsEmailUpdateLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  
  const [formData, setFormData] = useState({
    email: user?.email || '',
    notifications: {
      email: true,
      streamersLive: true,
      weeklyDigest: true
    }
  });

  // Update state to match new schema
  const [credits, setCredits] = useState({
    regular: 0
  });

  // Add new state for delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);

  // Add this new state
  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);

  const fetchUserData = async () => {
    setIsLoadingSubscriptions(true);
    try {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !currentUser) throw new Error("Please log in to continue.");

      // Get all user data in one query
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(`
          stripe_customer_id,
          tier,
          subscription_tier,
          subscription_status,
          last_credit_distribution,
          credits
        `)
        .eq("id", currentUser.id)
        .single();

      if (userError) throw userError;
      if (!userData) throw new Error("User data not found");

      // Update subscription state
      setSubscription({
        tier: userData.subscription_tier || userData.tier || 'free',
        status: userData.subscription_status || (userData.stripe_customer_id ? 'active' : 'inactive'),
        lastDistribution: userData.last_credit_distribution,
        nextDistribution: getNextDistributionDate(userData.last_credit_distribution)
      });

      // Update credits state
      setCredits({
        regular: userData.credits || 0
      });

    } catch (err) {
      console.error("Error fetching user data:", err.message);
      toast.error("Failed to load user data");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  };

  // Single useEffect for data fetching and polling
  useEffect(() => {
    // Initial fetch
    fetchUserData();
    
    // Set up polling with a longer interval (30 seconds instead of 10)
    const pollInterval = setInterval(fetchUserData, 30000);
    
    // Cleanup
    return () => clearInterval(pollInterval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await updateUser(formData);
      toast.success('Settings updated successfully');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    setIsEmailUpdateLoading(true);

    try {
      // Update email in Supabase Auth
      const { data, error: authError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (authError) throw authError;

      // Update email in users table
      const { error: dbError } = await supabase
        .from('users')
        .update({ email: newEmail })
        .eq('id', user.id);

      if (dbError) throw dbError;

      toast.success('Email update verification sent. Please check your new email.');
      setShowEmailUpdate(false);
      setNewEmail('');
    } catch (error) {
      console.error('Error updating email:', error);
      toast.error(error.message);
    } finally {
      setIsEmailUpdateLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      toast.error('Email does not match');
      return;
    }

    setIsDeleting(true);
    try {
      // First delete user data from related tables
      const { error: dbError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Delete user's auth account using RPC
      const { error: deleteError } = await supabase.rpc('delete_user');
      if (deleteError) throw deleteError;

      // Sign out the user
      await supabase.auth.signOut();
      
      toast.success('Account successfully deleted');
      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account: ' + error.message);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // Add this new function to handle cancellation
  const handleCancelSubscription = async (subscriptionId) => {
    try {
      const response = await fetch('http://localhost:3001/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId })
      });

      if (!response.ok) throw new Error('Failed to cancel subscription');

      toast.success('Subscription will be cancelled at the end of the billing period');
      // Refresh subscription
      fetchUserData();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast.error(error.message);
    }
  };

  const getNextDistributionDate = (lastDistribution) => {
    if (!lastDistribution) return 'Not available';
    
    const lastDate = new Date(lastDistribution);
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + 7); // Add 7 days
    
    // If next distribution is in the past, calculate from now
    if (nextDate < new Date()) {
      nextDate.setDate(new Date().getDate() + 7);
    }
    
    return nextDate.toLocaleDateString();
  };

  const getWeekRange = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Get Sunday
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Get Saturday
    
    return {
      start: startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      end: endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  };

  // Calculate weekly contribution based on subscription tier
  const calculateWeeklyContribution = (tier) => {
    const contributions = {
      'pogchamp': 2.75, // 55% of $5
      'gigachad': 5.50, // 55% of $10
      'free': 0
    };
    return contributions[tier] || 0;
  };

  const handleManageSubscription = async () => {
    try {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !currentUser) {
        throw new Error('Please log in to continue');
      }

      // Check if user has a Stripe customer ID
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', currentUser.id)
        .single();

      if (userError || !userData?.stripe_customer_id) {
        // If no Stripe customer ID, redirect to credits page to set up subscription
        toast.error('Please set up a subscription first');
        navigate('/credits');
        return;
      }

      // Create a portal session
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.id,
          return_url: window.location.origin + '/settings'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating portal session:', error);
      toast.error(error.message || 'Failed to open subscription management portal');
    }
  };

  return (
    <div className="settings-container">
      <h1 className="settings-header">Settings</h1>

      {/* Credits Display */}
      <section className="settings-section">
        <h2>Your Credits</h2>
        <div className="credits-display">
          <div>
            <h3>Available Credits</h3>
            <p>{credits.regular}</p>
          </div>
        </div>
      </section>

      {/* Subscription Display */}
      <section className="settings-section">
        <h2>Subscription</h2>
        {isLoadingSubscriptions ? (
          <p>Loading subscription details...</p>
        ) : subscription ? (
          <div className="subscription-info">
            <div className="subscription-info-row">
              <span className="subscription-label">Current Tier:</span>
              <span className={`subscription-value ${subscription.tier}`}>
                {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}
              </span>
            </div>
            
            <div className="subscription-info-row">
              <span className="subscription-label">Status:</span>
              <span className={`subscription-value ${subscription.status}`}>
                {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
              </span>
            </div>

            {subscription.status === 'active' && (
              <>
                <div className="prize-pool-contribution">
                  <div className="subscription-info-row">
                    <span className="subscription-label">Active Week:</span>
                    <span className="subscription-value">
                      {getWeekRange().start} - {getWeekRange().end}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="subscription-actions" style={{ marginTop: '1.5rem' }}>
              <button 
                onClick={handleManageSubscription}
                className="primary-button"
                style={{ width: '100%', maxWidth: '300px' }}
              >
                Manage Subscription
              </button>
            </div>
          </div>
        ) : (
          <p>No subscription found</p>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        {/* Account Section */}
        <section className="settings-section">
          <h2 className="settings-section-header">Account</h2>
          
          {/* Current Email Display */}
          <div className="form-group">
            <label className="form-label">Current Email</label>
            <div className="email-container">
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="form-input"
                style={{ opacity: 0.7 }}
              />
              <button
                type="button"
                onClick={() => setShowEmailUpdate(!showEmailUpdate)}
                className="secondary-button"
              >
                Change Email
              </button>
            </div>
          </div>

          {/* Email Update Form */}
          {showEmailUpdate && (
            <div className="form-group">
              <form onSubmit={handleEmailUpdate}>
                <label className="form-label">New Email Address</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="form-input"
                    placeholder="Enter new email"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isEmailUpdateLoading}
                    className="primary-button"
                  >
                    {isEmailUpdateLoading ? 'Updating...' : 'Update Email'}
                  </button>
                </div>
                <p className="help-text">
                  You'll need to verify your new email address before the change takes effect.
                </p>
              </form>
            </div>
          )}

          {/* Password Change Button */}
          <div className="settings-button-group">
            <button
              type="button"
              onClick={async () => {
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(user.email);
                  if (error) throw error;
                  toast.success('Password reset email sent. Please check your inbox.');
                } catch (error) {
                  console.error('Error sending reset email:', error);
                  toast.error('Failed to send reset email: ' + error.message);
                }
              }}
              className="secondary-button"
            >
              Change Password
            </button>
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="settings-section danger-zone">
          <h2 className="settings-section-header" style={{ color: '#ff4444' }}>Danger Zone</h2>
          <div className="form-group">
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteStep(1);
                setDeleteConfirmEmail('');
              }}
            >
              Delete Account Permanently
            </button>
            <p className="help-text" style={{ color: '#ff4444', marginTop: '0.5rem' }}>
              Once you delete your account, there is no going back. Please be certain.
            </p>
          </div>
        </section>
      </form>

      {/* Delete Account Modal - Moved outside the main form */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target.className === 'modal-overlay') {
            setShowDeleteModal(false);
          }
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {deleteStep === 1 && (
              <div>
                <h2 className="modal-title">Delete Account</h2>
                <div className="modal-message">
                  <p>Are you sure you want to delete your account? This action:</p>
                  <ul style={{ textAlign: 'left', marginTop: '1rem', marginBottom: '1rem' }}>
                    <li>Cannot be undone</li>
                    <li>Will delete all your data</li>
                    <li>Will remove all your credits</li>
                    <li>Will cancel any active subscriptions</li>
                  </ul>
                </div>
                <div className="modal-buttons">
                  <button 
                    type="button"
                    className="modal-button secondary"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="modal-button primary"
                    onClick={() => setDeleteStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <form onSubmit={(e) => {
                e.preventDefault();
                handleDeleteAccount();
              }}>
                <h2 className="modal-title">Confirm Deletion</h2>
                <div className="modal-message">
                  <p>To confirm deletion, please enter your email address:</p>
                  <p className="user-email">{user?.email}</p>
                  <input
                    type="text"
                    value={deleteConfirmEmail}
                    onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="form-input"
                    style={{ marginTop: '1rem' }}
                  />
                </div>
                <div className="modal-buttons">
                  <button 
                    type="button"
                    className="modal-button secondary"
                    onClick={() => {
                      setDeleteStep(1);
                      setDeleteConfirmEmail('');
                    }}
                  >
                    Back
                  </button>
                  <button 
                    type="submit"
                    className="modal-button danger"
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;