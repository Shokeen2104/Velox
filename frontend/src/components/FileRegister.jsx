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
        if (res.status === 401 || (res.status === 403 && data.error === 'Invalid or expired token')) {
          localStorage.removeItem('velox_token');
          localStorage.removeItem('swarmshare_token');
          window.location.href = '/login';
          return;
        }
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

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  return (
    <div className="dark-card">
      {/* Upload Icon Box */}
      <div 
        className="upload-icon-box"
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        style={{ cursor: 'pointer' }}
        title="Choose file to seed"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <h3 className="card-title">Register a File to Seed</h3>
      <p className="card-description">
        Select a file to share. It's hashed locally in your browser — only chunk metadata reaches the server, the file itself never leaves your device.
      </p>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Button: + SELECT FILE */}
      <div>
        <button 
          type="button"
          className="btn-red" 
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={isProcessing}
        >
          <span style={{ fontSize: '1rem', lineHeight: '0.8', marginRight: '2px' }}>+</span> SELECT FILE
        </button>
      </div>

      {file && (
        <div style={{
          marginTop: '1.25rem',
          padding: '1rem',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
              <span className="file-badge" style={{ minWidth: 'auto', padding: '2px 6px' }}>FILE</span>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.name}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ({formatFileSize(file.size)})
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
              title="Remove file"
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={!isPublic} 
                onChange={(e) => setIsPublic(!e.target.checked)} 
                style={{ accentColor: 'var(--accent-red)', cursor: 'pointer' }}
              />
              Make this file Private (requires password)
            </label>
            {!isPublic && (
              <input 
                type="password"
                placeholder="Enter password for this file"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.82rem', padding: '8px 12px' }}
              />
            )}
          </div>

          <button 
            type="button"
            className="btn-red" 
            onClick={handleRegister} 
            disabled={isProcessing || (!isPublic && !password)}
            style={{ width: '100%', padding: '10px 16px' }}
          >
            {isProcessing ? 'Hashing & Registering...' : 'Start Seeding to Network'}
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {status && (
        <div style={{ 
          marginTop: '0.9rem', 
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          color: status.includes('Error') ? 'var(--status-red)' : 'var(--status-green)'
        }}>
          <span className={`status-dot ${status.includes('Error') ? 'red' : 'green'}`}></span>
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
