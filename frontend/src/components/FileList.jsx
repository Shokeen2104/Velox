import { useState, useEffect } from 'react';
import { swarmManager } from '../utils/SwarmManager';

export default function FileList({ token }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const handleDownload = async (fileId) => {
    try {
      // 1. Fetch Manifest & Seeders
      const res = await fetch(`http://localhost:3001/api/files/${fileId}/manifest`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch manifest');
      
      const { file, chunks, seeders } = await res.json();
      
      // 2. Start P2P download
      swarmManager.startDownload(file, chunks, seeders);
    } catch (err) {
      alert(`Error initiating download: ${err.message}`);
    }
  };

  if (loading) return <div>Loading files...</div>;
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <h3>Available Files for Download</h3>
      <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Click download to find seeders and initiate a P2P WebRTC transfer.
      </p>

      {files.length === 0 ? (
        <p>No files available on the network yet.</p>
      ) : (
        <ul className="file-list">
          {files.map(file => (
            <li key={file.id} className="file-item">
              <div>
                <strong>{file.file_name}</strong>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Size: {(file.total_size / (1024 * 1024)).toFixed(2)} MB | Seeded by: {file.owner}
                </div>
              </div>
              <button className="btn" onClick={() => handleDownload(file.id)}>
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
