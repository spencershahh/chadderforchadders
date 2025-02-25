import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Get all streamers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('streamers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching streamers:', error);
    res.status(500).json({ error: 'Failed to fetch streamers' });
  }
});

// Add a new streamer
router.post('/', async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // First check if streamer already exists
    const { data: existing } = await supabase
      .from('streamers')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Streamer already exists' });
    }

    // Add new streamer
    const { data, error } = await supabase
      .from('streamers')
      .insert([
        { 
          username,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding streamer:', error);
    res.status(500).json({ error: 'Failed to add streamer' });
  }
});

// Delete a streamer
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('streamers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting streamer:', error);
    res.status(500).json({ error: 'Failed to delete streamer' });
  }
});

export default router; 