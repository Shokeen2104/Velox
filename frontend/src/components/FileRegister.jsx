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
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/files/register`, {
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
      
      // Clear the form
      setFile(null);
      setPassword('');
      setIsPublic(true);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
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
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', background: 'rgba(124, 58, 237, 0.2)', borderRadius: '12px', marginBottom: '1.5rem' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
      </div>
      
      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Register a File to Seed</h3>
      <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '2rem', lineHeight: '1.6' }}>
        Select a file to share. It's hashed locally in your browser — only chunk metadata reaches the server, the file itself never leaves your device.
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
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#f8fafc' }}
            disabled={isProcessing}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              Select File
            </span>
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
