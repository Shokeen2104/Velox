import { useState, useEffect } from 'react';
import { swarmManager } from '../utils/SwarmManager';
import { useToast } from './Toast';

export default function FileList({ token, activeTab, refreshKey }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [passwordPromptFile, setPasswordPromptFile] = useState(null);
  const [downloadPassword, setDownloadPassword] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const parseJwt = (t) => {
    try { return JSON.parse(atob(t.split('.')[1])); }
    catch { return null; }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const currentUserEmail = parseJwt(token)?.email;
  const addToast = useToast();
  const [activeDownloads, setActiveDownloads] = useState({});

  useEffect(() => {
    fetchFiles();
    
    const handleStateChange = (state) => {
      const dlMap = {};
      state.downloads.forEach(dl => {
        dlMap[dl.file.id] = dl;
      });
      setActiveDownloads(dlMap);
    };
    swarmManager.addListener(handleStateChange);
    return () => swarmManager.removeListener(handleStateChange);
  }, []);

  // Re-fetch when a new file is uploaded
  useEffect(() => {
    if (refreshKey > 0) fetchFiles();
  }, [refreshKey]);

  useEffect(() => {
    Object.values(activeDownloads).forEach(dl => {
      if (dl.status === 'complete' && !dl._toastShown) {
        addToast(`Download complete: ${dl.file.file_name}`, 'success');
        dl._toastShown = true;
      }
    });
  }, [activeDownloads, addToast]);

  const getFileTypeProps = (filename) => {
    const ext = filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'FILE';
    if (ext === 'PDF') return { text: 'PDF', bg: '#423122', color: '#fbbf24' };
    if (ext === 'DB' || ext === 'ACCDB') return { text: 'DB', bg: '#113528', color: '#34d399' };
    if (ext === 'DOC' || ext === 'DOCX') return { text: 'DOC', bg: '#2e2548', color: '#c084fc' };
    return { text: ext.substring(0, 3) || 'FILE', bg: '#1e293b', color: '#94a3b8' };
  };

  const fetchFiles = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/files`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('velox_token');
          localStorage.removeItem('swarmshare_token');
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch files');
      }
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadClick = (file) => {
    if (!file.is_available && (!file.seeder_count || file.seeder_count === 0)) {
      addToast(`Cannot download "${file.file_name}": The uploader is currently offline. They must have VELOX open to transfer.`, 'error');
      return;
    }
    if (!file.is_public) {
      setPasswordPromptFile(file);
      setDownloadPassword('');
      setDownloadError('');
    } else {
      handleDownload(file.id, null);
    }
  };

  const handleRetry = (file) => {
    swarmManager.resetDownload(file.id);
    handleDownloadClick(file);
  };

  const handleDownload = async (fileId, pwd) => {
    try {
      setDownloadError('');
      // 1. Fetch Manifest & Seeders
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/files/${fileId}/manifest`, {
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
      addToast(`Download started for ${file.file_name}`, 'info');
    } catch (err) {
      setDownloadError(err.message);
      if (!passwordPromptFile) {
        addToast(`Error initiating download: ${err.message}`, 'error');
      }
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm("Are you sure you want to delete this file? This will remove it for everyone.")) return;
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete file');
      }
      
      // Update state to remove the file
      setFiles(files.filter(f => f.id !== fileId));
      addToast('File deleted successfully', 'success');
    } catch (err) {
      addToast(`Error deleting file: ${err.message}`, 'error');
    }
  };

  if (loading) return <div>Loading files...</div>;
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'uploads' ? file.owner === currentUserEmail : true;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '1.5rem' }}>
        {activeTab === 'uploads'
          ? 'Manage the files you have shared to the network.'
          : 'All files registered for direct peer-to-peer transfer.'}
      </p>

      <input
        type="text"
        placeholder="Search files by name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search files by name"
        autoComplete="off"
        className="input-group"
        style={{ width: '100%', marginBottom: '1.5rem', padding: '0.5rem' }}
      />

      {filteredFiles.length === 0 ? (
        <p>{searchQuery ? 'No matching files found.' : 'No files available on the network yet.'}</p>
      ) : (
        <ul className="file-list">
          {filteredFiles.map(file => {
            const dlState = activeDownloads[file.id];
            const isFailed = dlState && dlState.status && dlState.status.startsWith('failed');
            const isComplete = dlState && dlState.status === 'complete';
            const isConnecting = dlState && dlState.status === 'connecting';
            const isDownloading = dlState && dlState.status === 'downloading';
            const progress = dlState ? dlState.progress || 0 : 0;
            const typeProps = getFileTypeProps(file.file_name);
            const isPeerOnline = file.seeder_count > 0 || file.is_available;

            return (
              <li key={file.id} className="file-item" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  
                  <div className="type-icon" style={{ background: typeProps.bg, color: typeProps.color }}>
                    {typeProps.text}
                  </div>

                  <div>
                    <strong style={{ fontSize: '1.1rem' }}>{!file.is_public && '🔒 '} {file.file_name}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.4rem', fontFamily: 'monospace' }}>
                      <span 
                        className="seeder-badge" 
                        title="Peer Status" 
                        style={{ 
                          background: isPeerOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isPeerOnline ? '#10b981' : '#ef4444',
                          border: `1px solid ${isPeerOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}
                      >
                        {isPeerOnline ? '● Peer Online' : '○ Peer Offline'}
                      </span>
                      {formatBytes(file.total_size)} &bull; shared by {file.owner}
                      {isDownloading && dlState?.speed > 0 && (
                        <span style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>
                          &bull; {formatSpeed(dlState.speed)}
                        </span>
                      )}
                      {isFailed && (
                        <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>
                          &bull; {dlState.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {file.owner === currentUserEmail && (
                    <button className="btn" style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }} onClick={() => handleDelete(file.id)}>
                      Delete
                    </button>
                  )}
                  
                  {isFailed ? (
                    <button 
                      className="btn" 
                      onClick={() => handleRetry(file)}
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.15)', 
                        border: '1px solid #ef4444', 
                        color: '#ef4444',
                        width: '120px', padding: '0.65rem 0.5rem', borderRadius: '8px',
                        fontSize: '0.85rem', fontWeight: 600
                      }}
                      title={dlState.status}
                    >
                      Failed ↻
                    </button>
                  ) : isComplete ? (
                    <button 
                      className="btn" 
                      disabled
                      style={{ 
                        background: 'var(--success)', 
                        border: 'none', 
                        width: '120px', padding: '0.65rem 1rem', borderRadius: '8px'
                      }}
                    >
                      Complete!
                    </button>
                  ) : isConnecting ? (
                    <button 
                      className="btn" 
                      disabled
                      style={{ 
                        background: 'rgba(245, 158, 11, 0.15)', 
                        border: '1px solid #f59e0b', 
                        color: '#f59e0b',
                        width: '120px', padding: '0.65rem 0.5rem', borderRadius: '8px',
                        fontSize: '0.85rem'
                      }}
                    >
                      Connecting...
                    </button>
                  ) : isDownloading ? (
                    <button 
                      className="btn" 
                      disabled
                      style={{ 
                        position: 'relative', overflow: 'hidden', 
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid var(--primary)',
                        width: '120px', padding: '0.75rem 1.5rem', borderRadius: '8px'
                      }}
                    >
                      <div style={{ 
                        position: 'absolute', top: 0, left: 0, bottom: 0, 
                        background: 'var(--primary)', width: `${progress}%`, transition: 'width 0.2s', zIndex: 0 
                      }} />
                      <span style={{ position: 'relative', zIndex: 1, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        {`${Math.round(progress)}%`}
                      </span>
                    </button>
                  ) : (
                    <button 
                      className="btn" 
                      onClick={() => handleDownloadClick(file)}
                      style={{
                        opacity: isPeerOnline ? 1 : 0.6,
                        cursor: isPeerOnline ? 'pointer' : 'not-allowed'
                      }}
                      title={isPeerOnline ? 'Download file via WebRTC' : 'Uploader is offline'}
                    >
                      {isPeerOnline ? 'Download' : 'Peer Offline'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
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
            <form onSubmit={(e) => {
              e.preventDefault();
              handleDownload(passwordPromptFile.id, downloadPassword);
            }}>
              <input
                type="password"
                placeholder="Password"
                autoFocus
                value={downloadPassword}
                onChange={e => setDownloadPassword(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn" onClick={() => setPasswordPromptFile(null)} style={{ background: 'transparent', border: '1px solid var(--glass-border)' }}>Cancel</button>
                <button type="submit" className="btn" style={{ flex: 1 }}>Confirm Download</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
