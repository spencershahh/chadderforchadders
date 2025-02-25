const fs = require('fs');
const path = require('path');
const { supabase } = require('../supabaseClient');

export default async function handler(req, res) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

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

    // Path to the streamers.json file
    const streamersFilePath = path.join(process.cwd(), 'src', 'data', 'streamers.json');

    // Write the updated streamers to the file
    fs.writeFileSync(streamersFilePath, JSON.stringify(streamers, null, 2));

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