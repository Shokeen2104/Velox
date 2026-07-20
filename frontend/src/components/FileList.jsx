import { useState, useEffect } from 'react';
import { swarmManager } from '../utils/SwarmManager';

export default function FileList({ token }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [passwordPromptFile, setPasswordPromptFile] = useState(null);
  const [downloadPassword, setDownloadPassword] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const parseJwt = (t) => {
    try { return JSON.parse(atob(t.split('.')[1])); }
    catch (e) { return null; }
  };
  const currentUserEmail = parseJwt(token)?.email;

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/files', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadClick = (file) => {
    if (!file.is_public) {
      setPasswordPromptFile(file);
      setDownloadPassword('');
      setDownloadError('');
    } else {
      handleDownload(file.id, null);
    }
  };

  const handleDownload = async (fileId, pwd) => {
    try {
      setDownloadError('');
      // 1. Fetch Manifest & Seeders
      const res = await fetch(`http://localhost:3001/api/files/${fileId}/manifest`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: pwd })
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Incorrect password');
        throw new Error('Failed to fetch manifest');
      }
      
      const { file, chunks, seeders } = await res.json();
      
      // 2. Start P2P download
      swarmManager.startDownload(file, chunks, seeders);
      setPasswordPromptFile(null);
    } catch (err) {
      setDownloadError(err.message);
      if (!passwordPromptFile) {
        alert(`Error initiating download: ${err.message}`);
      }
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm("Are you sure you want to delete this file? This will remove it for everyone.")) return;
    
    try {
      const res = await fetch(`http://localhost:3001/api/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete file');
      }
      
      // Update state to remove the file
      setFiles(files.filter(f => f.id !== fileId));
    } catch (err) {
      alert(`Error deleting file: ${err.message}`);
    }
  };

  if (loading) return <div>Loading files...</div>;
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  const filteredFiles = files.filter(file => 
    file.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <h3>Available Files for Download</h3>
      <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Click download to find seeders and initiate a P2P WebRTC transfer.
      </p>

      <input
        type="text"
        placeholder="Search files by name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="input-group"
        style={{ width: '100%', marginBottom: '1.5rem', padding: '0.5rem' }}
      />

      {filteredFiles.length === 0 ? (
        <p>{searchQuery ? 'No matching files found.' : 'No files available on the network yet.'}</p>
      ) : (
        <ul className="file-list">
          {filteredFiles.map(file => (
            <li key={file.id} className="file-item">
              <div>
                <strong>{!file.is_public && '🔒 '} {file.file_name}</strong>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Size: {(file.total_size / (1024 * 1024)).toFixed(2)} MB | Seeded by: {file.owner}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {file.owner === currentUserEmail && (
                  <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => handleDelete(file.id)}>
                    Delete
                  </button>
                )}
                <button className="btn" onClick={() => handleDownloadClick(file)}>
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {passwordPromptFile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '400px' }}>
            <h3>Private File</h3>
            <p style={{ marginBottom: '1rem' }}>Please enter the password to download <strong>{passwordPromptFile.file_name}</strong>.</p>
            {downloadError && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{downloadError}</div>}
            <input
              type="password"
              placeholder="Password"
              value={downloadPassword}
              onChange={e => setDownloadPassword(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn" onClick={() => setPasswordPromptFile(null)} style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}>Cancel</button>
              <button className="btn" onClick={() => handleDownload(passwordPromptFile.id, downloadPassword)} style={{ flex: 1 }}>Confirm Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
