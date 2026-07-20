const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/postgres');
const redisClient = require('../db/redis');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Endpoint to register a file manifest
// Client chunks file locally, hashes each chunk, uploads only the manifest (not the file).
router.post('/register', authenticateToken, async (req, res) => {
  const { fileName, totalSize, chunkSize, totalChunks, chunks, isPublic, password } = req.body;
  const userId = req.user.userId;

  // Validate the manifest payload
  if (!fileName || !totalSize || !chunkSize || !totalChunks || !Array.isArray(chunks) || chunks.length !== totalChunks) {
    return res.status(400).json({ error: 'Invalid manifest payload' });
  }

  let passwordHash = null;
  if (!isPublic) {
    if (!password) {
      return res.status(400).json({ error: 'Password is required for private files' });
    }
    passwordHash = await bcrypt.hash(password, 10);
  }

  const client = await db.query('SELECT NOW()'); // Just to test, we will use transactions soon
  
  // Begin transaction
  const pool = require('pg').Pool; // Or import pool from postgres.js if exported
  // Wait, db.query is a function that uses the pool. Let's use it for a simple query without tx for now or better get a client from pool.
  // I will refactor db/postgres.js later if needed, but we can do it in separate queries.
  // Actually, to avoid issues, we should probably do a transaction.
  // Let's modify postgres.js later, for now we will just run the queries sequentially.
  
  try {
    // 1. Insert file record
    const fileResult = await db.query(
      'INSERT INTO files (owner_id, file_name, total_size, chunk_size, total_chunks, is_public, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [userId, fileName, totalSize, chunkSize, totalChunks, isPublic !== false, passwordHash]
    );
    const fileId = fileResult.rows[0].id;

    // 2. Insert chunk hashes
    // We could use bulk insert, but for simplicity in v1 we can iterate or use a simple query
    // Let's build a bulk insert query
    let values = [];
    let placeholders = [];
    let index = 1;

    chunks.forEach((chunk) => {
      placeholders.push(`($${index++}, $${index++}, $${index++}, $${index++})`);
      values.push(fileId, chunk.index, chunk.hash, chunk.size);
    });

    const queryText = `INSERT INTO chunk_manifest (file_id, chunk_index, chunk_hash, chunk_size) VALUES ${placeholders.join(', ')}`;
    await db.query(queryText, values);

    // 3. Mark uploader as an available seeder for this file in Redis
    // We will use a set 'file:seeders:{fileId}' and add the userId to it for now
    // (In later phases, we will add the socketId when they connect, but this sets initial intent)
    await redisClient.sAdd(`file:seeders:${fileId}`, userId.toString());
    
    // Also mark which chunks this peer has in Redis (all of them since they are the original seeder)
    // For large files, maybe just a simple flag "has_all" or add all indices
    // Here we'll just record presence for now. We can assume the registered seeder has all chunks.

    res.status(201).json({ message: 'File registered successfully', fileId });
  } catch (error) {
    console.error('File registration error:', error);
    res.status(500).json({ error: 'Failed to register file' });
  }
});

// Endpoint to discover all available files
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT f.id, f.file_name, f.total_size, f.created_at, f.is_public, u.email as owner FROM files f JOIN users u ON f.owner_id = u.id ORDER BY f.created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Endpoint to get a file manifest and online seeders
router.post('/:id/manifest', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { password } = req.body || {};
    
    // Get file info
    const fileRes = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    const file = fileRes.rows[0];

    // Check password if private
    if (!file.is_public) {
      if (!password) {
        return res.status(403).json({ error: 'Password required' });
      }
      const match = await bcrypt.compare(password, file.password_hash);
      if (!match) {
        return res.status(403).json({ error: 'Incorrect password' });
      }
    }

    // Get chunk hashes
    const chunksRes = await db.query('SELECT chunk_index, chunk_hash, chunk_size FROM chunk_manifest WHERE file_id = $1 ORDER BY chunk_index ASC', [fileId]);
    
    // Get online seeders from Redis
    const seeders = await redisClient.sMembers(`file:seeders:${fileId}`);
    // A more advanced system would filter these seeders by checking if they are currently online in `peer:online:*`
    // We will do that when Socket.IO connects them.

    res.json({
      file,
      chunks: chunksRes.rows,
      seeders
    });
  } catch (error) {
    console.error('Error fetching manifest:', error);
    res.status(500).json({ error: 'Failed to fetch manifest' });
  }
});

module.exports = router;
