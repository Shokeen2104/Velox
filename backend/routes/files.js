const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/postgres');
const peerStore = require('../db/peerStore');
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

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Insert file record
    const fileResult = await client.query(
      'INSERT INTO files (owner_id, file_name, total_size, chunk_size, total_chunks, is_public, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [userId, fileName, totalSize, chunkSize, totalChunks, isPublic !== false, passwordHash]
    );
    const fileId = fileResult.rows[0].id;

    // 2. Insert chunk hashes in bulk
    let values = [];
    let placeholders = [];
    let index = 1;

    chunks.forEach((chunk) => {
      placeholders.push(`($${index++}, $${index++}, $${index++}, $${index++})`);
      values.push(fileId, chunk.index, chunk.hash, chunk.size);
    });

    const queryText = `INSERT INTO chunk_manifest (file_id, chunk_index, chunk_hash, chunk_size) VALUES ${placeholders.join(', ')}`;
    await client.query(queryText, values);

    await client.query('COMMIT');

    // 3. Register uploader as an active seeder in memory
    peerStore.addSeeder(fileId, userId);

    res.status(201).json({ message: 'File registered successfully', fileId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('File registration error:', error);
    res.status(500).json({ error: 'Failed to register file' });
  } finally {
    client.release();
  }
});

// Endpoint to discover all available files
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT f.id, f.file_name, f.total_size, f.created_at, f.is_public, f.owner_id, u.email as owner FROM files f JOIN users u ON f.owner_id = u.id ORDER BY f.created_at DESC'
    );

    // Enrich files with in-memory peer availability
    const filesWithStatus = result.rows.map((file) => {
      const onlineSeeders = peerStore.getOnlineSeeders(file.id);
      const isOwnerOnline = peerStore.isUserOnline(file.owner_id);
      const isAvailable = onlineSeeders.length > 0 || isOwnerOnline;

      return {
        ...file,
        is_available: isAvailable,
        seeder_count: onlineSeeders.length > 0 ? onlineSeeders.length : (isOwnerOnline ? 1 : 0)
      };
    });

    res.json(filesWithStatus);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Endpoint to get a file manifest and available peer
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
    const chunksRes = await db.query(
      'SELECT chunk_index, chunk_hash, chunk_size FROM chunk_manifest WHERE file_id = $1 ORDER BY chunk_index ASC',
      [fileId]
    );
    
    // Get online seeders for 1-to-1 transfer
    let seeders = peerStore.getOnlineSeeders(fileId);
    
    // If none explicitly announced but the owner is online, fall back to owner
    if (seeders.length === 0 && peerStore.isUserOnline(file.owner_id)) {
      seeders = [file.owner_id.toString()];
    }

    // Remove sensitive password hash before sending to client
    delete file.password_hash;

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

// Endpoint to delete a file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.userId;

    // Check ownership
    const fileRes = await db.query('SELECT owner_id FROM files WHERE id = $1', [fileId]);
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (fileRes.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }

    // Delete file (Postgres CASCADE deletes chunk_manifest)
    await db.query('DELETE FROM files WHERE id = $1', [fileId]);
    
    // Clean up in-memory peer tracking
    peerStore.deleteFile(fileId);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
