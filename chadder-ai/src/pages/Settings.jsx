import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth'; // Assuming you have an auth hook
import { toast } from 'react-hot-toast'; // For notifications
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './Settings.module.css';

const Settings = () => {
  const { user, loading: authLoading, error: authError } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailUpdateLoading, setIsEmailUpdateLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [credits, setCredits] = useState(0);
  const [subscription, setSubscription] = useState({
    tier: 'free',
    status: 'inactive',
    lastDistribution: null,
    nextDistribution: null
  });
  const [error, setError] = useState('');
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (authError) {
      console.error('Auth error:', authError);
      toast.error('Authentication error. Please try logging in again.');
      navigate('/login');
      return;
    }

    if (!authLoading && !user) {
      navigate('/login');
      return;
    }

    if (user) {
      fetchUserData();
    }
  }, [user, authLoading, authError]);

  const fetchUserData = async () => {
    try {
      setIsLoading(true);
      console.log('Fetching user data...');

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          subscription_credits(amount, distribution_date)
        `)
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Database error:', userError);
        throw userError;
      }

      if (!userData) {
        console.error('No user data found');
        throw new Error('No user data found');
      }

      console.log('Fetched user data:', userData);
      setUserData(userData);
      setCredits(userData.credits || 0);
      setSubscription({
        tier: userData.subscription_tier || 'free',
        status: userData.subscription_status || 'inactive',
        lastDistribution: userData.last_credit_distribution,
        nextDistribution: getNextDistributionDate(userData.last_credit_distribution)
      });
    } catch (error) {
      console.error('Error in fetchUserData:', error);
      toast.error('Failed to load user data. Please try refreshing the page.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTierName = (tier) => {
    if (!tier) return 'Free';
    // Map old tier names to new ones if they still exist in the database
    const tierMap = {
      'pog': 'Common',
      'pogchamp': 'Rare',
      'poggers': 'Epic',
      'common': 'Common',
      'rare': 'Rare',
      'epic': 'Epic'
    };
    return tierMap[tier.toLowerCase()] || tier.charAt(0).toUpperCase() + tier.slice(1);
  };

  // Set up real-time subscription for user updates with reconnection logic
  useEffect(() => {
    let mounted = true;
    
    const setupRealtimeSubscription = async () => {
      if (!user?.id) return;

      try {
        // Remove any existing subscriptions first
        const channels = supabase.getChannels();
        channels.forEach(channel => supabase.removeChannel(channel));

        const userChannel = supabase.channel('user-updates')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${user.id}`
            },
            (payload) => {
              console.log('User update received:', payload);
              if (mounted) {
                fetchUserData();
              }
            }
          )
          .subscribe((status) => {
            console.log('User channel status:', status);
          });

        const creditsChannel = supabase.channel('credits-updates')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'subscription_credits',
              filter: `user_id=eq.${user.id}`
            },
            (payload) => {
              console.log('Credits update received:', payload);
              if (mounted) {
                fetchUserData();
              }
            }
          )
          .subscribe((status) => {
            console.log('Credits channel status:', status);
          });

        return () => {
          mounted = false;
          supabase.removeChannel(userChannel);
          supabase.removeChannel(creditsChannel);
        };
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
      }
    };

    fetchUserData();
    setupRealtimeSubscription();

    return () => {
      mounted = false;
      const channels = supabase.getChannels();
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [user?.id]);

  const handleManageSubscription = async () => {
    try {
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      // If no Stripe customer ID or inactive subscription, redirect to credits page
      if (!userData?.stripe_customer_id || subscription.status !== 'active') {
        navigate('/credits');
        return;
      }

      // Create portal session
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
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
      console.error('Error managing subscription:', error);
      toast.error(error.message || 'Failed to manage subscription');
    }
  };

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
    setError('');

    try {
      // Validate the new email
      if (!newEmail || newEmail === user?.email) {
        throw new Error('Please enter a different email address');
      }

      const siteUrl = import.meta.env.VITE_APP_URL || 'https://chadderai.vercel.app';
      
      // Try to update email in Supabase Auth with redirect URL
      const { data, error: authError } = await supabase.auth.updateUser({
        email: newEmail,
      }, {
        emailRedirectTo: `${siteUrl}/settings`
      });

      if (authError) {
        console.error('Auth error updating email:', authError);
        throw authError;
      }

      // Only update the users table if auth update was successful
      if (data?.user) {
        const { error: dbError } = await supabase
          .from('users')
          .update({ email: newEmail })
          .eq('id', user.id);

        if (dbError) {
          console.error('Database error updating email:', dbError);
          throw dbError;
        }

        toast.success('Email update verification sent. Please check your new email to confirm the change.', {
          duration: 5000
        });
        setShowEmailUpdate(false);
        setNewEmail('');
      }
    } catch (error) {
      console.error('Error updating email:', error);
      toast.error(error.message || 'Failed to update email. Please try again.');
      setError(error.message);
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
      // First, cancel any active subscriptions
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      if (userData?.stripe_customer_id) {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        try {
          await fetch(`${API_URL}/cancel-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: userData.stripe_customer_id })
          });
        } catch (err) {
          console.error('Error cancelling subscription:', err);
          // Continue with deletion even if subscription cancellation fails
        }
      }

      // Delete user's auth account using RPC first
      const { error: deleteError } = await supabase.rpc('delete_user');
      if (deleteError) throw deleteError;

      // Then delete user data from users table
      const { error: dbError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (dbError) throw dbError;

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
      'pog': 1.65, // 55% of $3
      'pogchamp': 2.75, // 55% of $5
      'poggers': 3.85, // 55% of $7
      'free': 0
    };
    return contributions[tier] || 0;
  };

  if (isLoading) {
    return (
      <div className={styles.settingsContainer}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.settingsContainer}>
      <h1>Settings</h1>

      <section className={styles.section}>
        <h2>Your Credits</h2>
        <div className={styles.creditsInfo}>
          <h3>Available Credits</h3>
          <div className={styles.creditsAmount}>{credits}</div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Subscription</h2>
        <div className={styles.subscriptionInfo}>
          <div>Current Tier: {formatTierName(subscription.tier)}</div>
          <div>Status: {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}</div>
          <button
            className={styles.manageButton}
            onClick={handleManageSubscription}
          >
            {subscription.status === 'active' ? 'Manage Subscription' : 'Subscribe Now'}
          </button>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        <section className={styles.section}>
          <h2>Account</h2>
          <div className={styles.accountInfo}>
            <div>
              <h3>Current Email</h3>
              <p>{user?.email}</p>
              <button
                type="button"
                onClick={() => setShowEmailUpdate(!showEmailUpdate)}
                className={styles.secondaryButton}
              >
                Change Email
              </button>
              
              {showEmailUpdate && (
                <form onSubmit={handleEmailUpdate} className={styles.emailUpdateForm}>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="New Email Address"
                    required
                    className={styles.formInput}
                  />
                  <div className={styles.emailUpdateButtons}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailUpdate(false);
                        setNewEmail('');
                      }}
                      className={styles.secondaryButton}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isEmailUpdateLoading || !newEmail}
                      className={styles.primaryButton}
                    >
                      {isEmailUpdateLoading ? 'Updating...' : 'Update Email'}
                    </button>
                  </div>
                </form>
              )}
            </div>
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
              className={styles.secondaryButton}
            >
              Change Password
            </button>
          </div>
        </section>

        <section className={styles.dangerZone}>
          <h2>Danger Zone</h2>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => {
              setShowDeleteModal(true);
              setDeleteStep(1);
              setDeleteConfirmEmail('');
            }}
          >
            Delete Account Permanently
          </button>
          <p className={styles.warning}>
            Once you delete your account, there is no going back. Please be certain.
          </p>
        </section>
      </form>

      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={(e) => {
          if (e.target.className === styles.modalOverlay) {
            setShowDeleteModal(false);
          }
        }}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            {deleteStep === 1 && (
              <div>
                <h2 className={styles.modalTitle}>Delete Account</h2>
                <div className={styles.modalMessage}>
                  <p>Are you sure you want to delete your account? This action:</p>
                  <ul style={{ textAlign: 'left', marginTop: '1rem', marginBottom: '1rem' }}>
                    <li>Cannot be undone</li>
                    <li>Will delete all your data</li>
                    <li>Will remove all your credits</li>
                    <li>Will cancel any active subscriptions</li>
                  </ul>
                </div>
                <div className={styles.modalButtons}>
                  <button 
                    type="button"
                    className={styles.modalButtonSecondary}
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className={styles.modalButtonPrimary}
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
                <h2 className={styles.modalTitle}>Confirm Deletion</h2>
                <div className={styles.modalMessage}>
                  <p>To confirm deletion, please enter your email address:</p>
                  <p className={styles.userEmail}>{user?.email}</p>
                  <input
                    type="text"
                    value={deleteConfirmEmail}
                    onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                    placeholder="Enter your email"
                    className={styles.formInput}
                    style={{ marginTop: '1rem' }}
                  />
                </div>
                <div className={styles.modalButtons}>
                  <button 
                    type="button"
                    className={styles.modalButtonSecondary}
                    onClick={() => {
                      setDeleteStep(1);
                      setDeleteConfirmEmail('');
                    }}
                  >
                    Back
                  </button>
                  <button 
                    type="submit"
                    className={styles.modalButtonDanger}
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