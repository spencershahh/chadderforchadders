import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from './UserManagement.module.css';
import toast from 'react-hot-toast';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isUpdatingAdmin, setIsUpdatingAdmin] = useState(false);
  const [page, setPage] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('created_at:desc');
  const pageSize = 20;

  // Load users on initial render and when dependencies change
  useEffect(() => {
    loadUsers();
  }, [page, activeFilter, sortOrder]);

  // Load users from Supabase
  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First count total users for pagination
      const countQuery = supabase
        .from('users')
        .select('id', { count: 'exact' });
      
      // Apply filters for the count
      if (activeFilter === 'subscribers') {
        countQuery.not('subscription_tier', 'eq', 'free');
      } else if (activeFilter === 'free') {
        countQuery.eq('subscription_tier', 'free');
      }
      
      const { count: totalCount, error: countError } = await countQuery;
      
      if (countError) throw countError;
      setTotalUsers(totalCount || 0);
      
      // Now get the actual data
      let query = supabase
        .from('users')
        .select(`
          *
        `)
        .range(page * pageSize, (page * pageSize) + pageSize - 1);
      
      // Apply filters
      if (activeFilter === 'subscribers') {
        query.not('subscription_tier', 'eq', 'free');
      } else if (activeFilter === 'free') {
        query.eq('subscription_tier', 'free');
      }
      
      // Apply sorting
      const [sortField, sortDirection] = sortOrder.split(':');
      query.order(sortField, { ascending: sortDirection === 'asc' });
      
      const { data: userData, error: userError } = await query;
      
      if (userError) throw userError;
      
      // Check admin status separately to avoid the relationship error
      const { data: adminsData, error: adminsError } = await supabase
        .from('admins')
        .select('user_id');
        
      if (adminsError) {
        console.warn('Could not fetch admin data:', adminsError);
      }
      
      // Create a Set of admin user IDs for quick lookup
      const adminUserIds = new Set((adminsData || []).map(admin => admin.user_id));
      
      // Enhance the users with isAdmin property
      const enhancedUsers = userData.map(user => ({
        ...user,
        isAdmin: adminUserIds.has(user.id)
      }));
      
      setUsers(enhancedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setError(error.message);
      toast.error(`Failed to load users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Search handler that filters the local users array
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  // Toggle admin status for a user
  const toggleAdminStatus = async (userId, isCurrentlyAdmin) => {
    try {
      setIsUpdatingAdmin(true);
      
      if (isCurrentlyAdmin) {
        // Remove admin privileges
        const { error } = await supabase
          .from('admins')
          .delete()
          .eq('user_id', userId);
        
        if (error) throw error;
        toast.success('Admin privileges revoked');
      } else {
        // Grant admin privileges
        const { error } = await supabase
          .from('admins')
          .insert([{ user_id: userId }]);
        
        if (error) throw error;
        toast.success('Admin privileges granted');
      }
      
      // Refresh the user list
      await loadUsers();
      
      // Update selected user if it was the one being modified
      if (selectedUser?.id === userId) {
        setSelectedUser({
          ...selectedUser,
          isAdmin: !isCurrentlyAdmin
        });
      }
    } catch (error) {
      console.error('Error toggling admin status:', error);
      toast.error(`Failed to update admin status: ${error.message}`);
    } finally {
      setIsUpdatingAdmin(false);
    }
  };

  // View user details
  const handleViewUser = (user) => {
    setSelectedUser(user);
  };

  // Close user detail panel
  const handleCloseUserDetail = () => {
    setSelectedUser(null);
  };

  // Filter displayed users based on search term
  const filteredUsers = users.filter(user => {
    if (!searchTerm.trim()) return true;
    
    const search = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(search) ||
      user.id?.toLowerCase().includes(search) ||
      user.display_name?.toLowerCase().includes(search)
    );
  });

  // Handle pagination
  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  // Format date for UI display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={styles.userManagement}>
      <div className={styles.controlPanel}>
        <h2>User Management</h2>
        
        <div className={styles.controls}>
          <div className={styles.searchBar}>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={handleSearch}
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.filters}>
            <select 
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Users</option>
              <option value="subscribers">Subscribers Only</option>
              <option value="free">Free Users Only</option>
            </select>
            
            <select 
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={styles.sortSelect}
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="email:asc">Email (A-Z)</option>
              <option value="email:desc">Email (Z-A)</option>
              <option value="gem_balance:desc">Most Gems</option>
              <option value="gem_balance:asc">Least Gems</option>
            </select>
          </div>
          
          <button 
            onClick={() => loadUsers()}
            className={styles.refreshButton}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
          <button onClick={loadUsers} className={styles.retryButton}>
            Retry
          </button>
        </div>
      )}
      
      <div className={styles.userListContainer}>
        <table className={styles.userList}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Gems</th>
              <th>Subscription</th>
              <th>Joined</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="7" className={styles.loadingCell}>Loading users...</td></tr>}
            
            {!loading && filteredUsers.length === 0 && (
              <tr><td colSpan="7" className={styles.emptyCell}>No users found</td></tr>
            )}
            
            {!loading && filteredUsers.map(user => (
              <tr key={user.id} className={user.isAdmin ? styles.adminRow : ''}>
                <td>{user.email || 'N/A'}</td>
                <td>{user.display_name || 'No name'}</td>
                <td>{user.gem_balance || 0}</td>
                <td>
                  <span className={styles.subscriptionBadge + ' ' + styles[user.subscription_tier || 'free']}>
                    {user.subscription_tier?.charAt(0).toUpperCase() + user.subscription_tier?.slice(1) || 'Free'}
                  </span>
                </td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <span className={user.isAdmin ? styles.adminBadge : styles.notAdminBadge}>
                    {user.isAdmin ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  <button 
                    onClick={() => handleViewUser(user)} 
                    className={styles.viewButton}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination controls */}
      <div className={styles.pagination}>
        <button 
          onClick={() => handlePageChange(page - 1)} 
          disabled={page === 0 || loading}
          className={styles.paginationButton}
        >
          Previous
        </button>
        
        <span className={styles.pageInfo}>
          Page {page + 1} of {Math.max(1, Math.ceil(totalUsers / pageSize))}
        </span>
        
        <button 
          onClick={() => handlePageChange(page + 1)} 
          disabled={(page + 1) * pageSize >= totalUsers || loading}
          className={styles.paginationButton}
        >
          Next
        </button>
      </div>
      
      {/* User Detail Panel */}
      {selectedUser && (
        <div className={styles.userDetailOverlay}>
          <div className={styles.userDetailPanel}>
            <button
              className={styles.closeButton} 
              onClick={handleCloseUserDetail}
            >
              ×
            </button>
            
            <div className={styles.userDetailHeader}>
              <h3>{selectedUser.display_name || 'User'}</h3>
              <p className={styles.userEmail}>{selectedUser.email}</p>
            </div>
            
            <div className={styles.userDetailContent}>
              <div className={styles.userStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>User ID:</span>
                  <span className={styles.statValue}>{selectedUser.id}</span>
                </div>
                
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Gems:</span>
                  <span className={styles.statValue}>{selectedUser.gem_balance || 0}</span>
                </div>
                
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Subscription:</span>
                  <span className={styles.statValue + ' ' + styles.subscriptionValue}>
                    <span className={styles.subscriptionBadge + ' ' + styles[selectedUser.subscription_tier || 'free']}>
                      {selectedUser.subscription_tier?.charAt(0).toUpperCase() + selectedUser.subscription_tier?.slice(1) || 'Free'}
                    </span>
                  </span>
                </div>
                
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Joined:</span>
                  <span className={styles.statValue}>{formatDate(selectedUser.created_at)}</span>
                </div>
                
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Last Login:</span>
                  <span className={styles.statValue}>{formatDate(selectedUser.last_sign_in_at)}</span>
                </div>
                
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Admin Status:</span>
                  <span className={styles.statValue}>
                    <span className={selectedUser.isAdmin ? styles.adminBadge : styles.notAdminBadge}>
                      {selectedUser.isAdmin ? 'Admin' : 'Not Admin'}
                    </span>
                  </span>
                </div>
              </div>
              
              <div className={styles.adminControls}>
                <button
                  onClick={() => toggleAdminStatus(selectedUser.id, selectedUser.isAdmin)}
                  className={selectedUser.isAdmin ? styles.revokeButton : styles.grantButton}
                  disabled={isUpdatingAdmin}
                >
                  {isUpdatingAdmin ? 'Updating...' : (selectedUser.isAdmin ? 'Revoke Admin' : 'Make Admin')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement; 