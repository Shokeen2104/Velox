import { useState, useRef } from 'react';
import { processFileChunks } from '../utils/fileChunking';

export default function FileRegister({ token, onFileRegistered }) {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const fileInputRef = useRef(null);

  // We use 256KB chunks (BitTorrent typically uses 256KB to 1MB)
  const CHUNK_SIZE = 256 * 1024;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setProgress(0);
      setStatus('');
    }
  };

  const handleRegister = async () => {
    if (!file) return;

    try {
      setIsProcessing(true);
      setStatus('Hashing file chunks locally...');
      
      // Step 1: Chunk and hash locally
      const manifest = await processFileChunks(file, CHUNK_SIZE, (p) => {
        setProgress(p);
      });

      setStatus('Uploading manifest to signaling server...');

      // Step 2: Upload manifest to server
      const res = await fetch('http://localhost:3001/api/files/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...manifest, isPublic, password })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register file');
      }

      setStatus('File registered successfully! You are now seeding.');
      if (onFileRegistered) {
        onFileRegistered(data.fileId, file); // Keep reference to actual file for seeding later
      }
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <h3>Register a File to Seed</h3>
      <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Select a file to share. It will be hashed locally in your browser.
        The file itself is never uploaded to the server, only the chunk metadata.
      </p>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button 
          className="btn" 
          onClick={() => fileInputRef.current.click()}
          style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid var(--glass-border)' }}
          disabled={isProcessing}
        >
          Select File
        </button>
        {file && <span style={{ fontWeight: 'bold' }}>{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>}
      </div>

      {file && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={!isPublic} 
                onChange={(e) => setIsPublic(!e.target.checked)} 
              />
              Make this file Private (requires password)
            </label>
            {!isPublic && (
              <input 
                type="password"
                placeholder="Enter a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ marginTop: '0.5rem', width: '100%' }}
                className="input-group"
              />
            )}
          </div>
          <button 
            className="btn" 
            onClick={handleRegister} 
            disabled={isProcessing || (!isPublic && !password)}
            style={{ width: '100%' }}
          >
            {isProcessing ? 'Processing...' : 'Register & Start Seeding'}
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {status && (
        <div style={{ marginTop: '1rem', color: status.includes('Error') ? 'var(--danger)' : 'var(--success)' }}>
          {status}
        </div>
      )}
    </div>
  );
}
