import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is authenticated and is an admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (adminError || !adminData) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get the streamers data from the request body
    const streamers = req.body;
    
    if (!Array.isArray(streamers)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Use the upsert function we created to update all streamers at once
    const { data, error } = await supabase.rpc('upsert_streamers', { 
      streamers_data: streamers 
    });

    if (error) {
      console.error('Error calling upsert_streamers:', error);
      return res.status(500).json({ error: error.message });
    }

    // Save to public json file too for backward compatibility
    // First fetch existing streamers data
    const { data: existingData, error: fetchError } = await supabase
      .from('streamers')
      .select('username, bio')
      .order('username');

    if (fetchError) {
      return res.status(500).json({ error: 'Error fetching updated streamers' });
    }

    // Also try to update the public JSON file for compatibility
    try {
      // This won't work on Vercel, but it's here for completeness
      // The app will now use Supabase directly for most operations
      const fs = require('fs');
      const path = require('path');
      const publicPath = path.join(process.cwd(), 'public', 'streamers.json');
      fs.writeFileSync(publicPath, JSON.stringify(existingData, null, 2));
    } catch (fsError) {
      console.warn('Could not update streamers.json file:', fsError);
      // Continue anyway since we've updated the database
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Streamers updated successfully',
      streamerCount: streamers.length
    });

  } catch (error) {
    console.error('Error updating streamers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 