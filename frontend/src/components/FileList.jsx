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

  const getFileType = (filename) => {
    if (!filename || !filename.includes('.')) return 'FILE';
    const ext = filename.split('.').pop().toUpperCase();
    return ext.length > 4 ? ext.substring(0, 4) : ext;
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

  if (loading) {
    return (
      <div className="dark-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div className="status-dot green" style={{ marginBottom: '0.75rem', transform: 'scale(1.3)' }}></div>
        <div>Loading files from network...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark-card" style={{ padding: '2rem', color: 'var(--status-red)' }}>
        <p>Error loading files: {error}</p>
        <button className="btn-outline" onClick={fetchFiles} style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    );
  }

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'uploads' ? file.owner === currentUserEmail : true;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="dark-card">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.2rem', lineHeight: '1.4' }}>
        {activeTab === 'uploads'
          ? 'Manage the files you have shared to the network.'
          : 'All files registered for direct peer-to-peer transfer.'}
      </p>

      {/* Search Bar */}
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search files by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search files by name"
          autoComplete="off"
          className="search-input"
        />
      </div>

      {filteredFiles.length === 0 ? (
        <div style={{
          padding: '2.5rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          background: 'var(--bg-inset)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)'
        }}>
          {searchQuery
            ? `No matching files found for "${searchQuery}".`
            : activeTab === 'uploads'
            ? "You haven't uploaded any files yet. Use 'Register a File to Seed' to share a file."
            : 'No files registered on the network yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredFiles.map(file => {
            const dlState = activeDownloads[file.id];
            const isFailed = dlState && dlState.status && dlState.status.startsWith('failed');
            const isComplete = dlState && dlState.status === 'complete';
            const isConnecting = dlState && dlState.status === 'connecting';
            const isDownloading = dlState && dlState.status === 'downloading';
            const progress = dlState ? dlState.progress || 0 : 0;
            const isPeerOnline = file.seeder_count > 0 || file.is_available;
            const fileExt = getFileType(file.file_name);

            return (
              <div key={file.id} className="file-item-row">
                {/* Left side: Icon badge + File Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', overflow: 'hidden' }}>
                  <div className="file-badge">
                    {fileExt}
                  </div>

                  <div style={{ overflow: 'hidden' }}>
                    <div className="file-title">
                      {!file.is_public && <span title="Private (Password Required)">🔒 </span>}
                      {file.file_name}
                    </div>
                    <div className="file-meta-text">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: isPeerOnline ? 'var(--status-green)' : 'var(--status-red)' }}>
                        <span className={`status-dot ${isPeerOnline ? 'green' : 'red'}`} style={{ width: '6px', height: '6px' }}></span>
                        {isPeerOnline ? 'Peer online' : 'Peer offline'}
                      </span>
                      <span className="file-meta-dot">•</span>
                      <span>{formatBytes(file.total_size)}</span>
                      <span className="file-meta-dot">•</span>
                      <span style={{ color: 'var(--text-muted)' }}>shared by {file.owner}</span>

                      {isDownloading && dlState?.speed > 0 && (
                        <>
                          <span className="file-meta-dot">•</span>
                          <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
                            {formatSpeed(dlState.speed)}
                          </span>
                        </>
                      )}
                      {isFailed && (
                        <>
                          <span className="file-meta-dot">•</span>
                          <span style={{ color: 'var(--status-red)' }}>
                            {dlState.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Action Buttons */}
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0 }}>
                  {file.owner === currentUserEmail && (
                    <button 
                      type="button"
                      className="btn-delete-text" 
                      onClick={() => handleDelete(file.id)}
                    >
                      Delete
                    </button>
                  )}
                  
                  {isFailed ? (
                    <button 
                      type="button"
                      className="btn-outline" 
                      onClick={() => handleRetry(file)}
                      style={{ 
                        color: 'var(--status-red)', 
                        borderColor: 'rgba(255, 71, 66, 0.4)',
                        padding: '7px 14px',
                        fontSize: '0.75rem'
                      }}
                      title={dlState.status}
                    >
                      Failed ↻
                    </button>
                  ) : isComplete ? (
                    <button 
                      type="button"
                      className="btn-outline" 
                      disabled
                      style={{ 
                        color: 'var(--status-green)', 
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        background: 'rgba(16, 185, 129, 0.08)',
                        padding: '7px 14px',
                        fontSize: '0.75rem'
                      }}
                    >
                      Complete ✓
                    </button>
                  ) : isConnecting ? (
                    <button 
                      type="button"
                      className="btn-outline" 
                      disabled
                      style={{ 
                        color: 'var(--status-amber)', 
                        borderColor: 'rgba(245, 158, 11, 0.4)',
                        padding: '7px 14px',
                        fontSize: '0.75rem'
                      }}
                    >
                      Connecting...
                    </button>
                  ) : isDownloading ? (
                    <button 
                      type="button"
                      disabled
                      style={{ 
                        position: 'relative', 
                        overflow: 'hidden', 
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--accent-red)',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        minWidth: '100px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ 
                        position: 'absolute', top: 0, left: 0, bottom: 0, 
                        background: 'var(--accent-red)', width: `${progress}%`, transition: 'width 0.2s', zIndex: 0 
                      }} />
                      <span style={{ position: 'relative', zIndex: 1 }}>
                        {`${Math.round(progress)}%`}
                      </span>
                    </button>
                  ) : (
                    <button 
                      type="button"
                      className={isPeerOnline ? 'btn-red' : 'btn-offline'} 
                      onClick={() => handleDownloadClick(file)}
                      disabled={!isPeerOnline}
                      title={isPeerOnline ? 'Download file via WebRTC direct swarm' : 'Uploader is currently offline'}
                    >
                      {isPeerOnline ? 'DOWNLOAD' : 'Peer Offline'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Password Prompt Modal */}
      {passwordPromptFile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div className="dark-card" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <span className="status-dot red"></span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                Private File Access
              </h3>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              Please enter the password to download <strong style={{ color: '#fff' }}>{passwordPromptFile.file_name}</strong>.
            </p>

            {downloadError && (
              <div style={{ 
                color: 'var(--status-red)', 
                background: 'rgba(255, 71, 66, 0.1)', 
                border: '1px solid rgba(255, 71, 66, 0.25)', 
                borderRadius: '6px', 
                padding: '8px 12px', 
                fontSize: '0.8rem', 
                marginBottom: '1rem' 
              }}>
                {downloadError}
              </div>
            )}

            <form onSubmit={(e) => {
              e.preventDefault();
              handleDownload(passwordPromptFile.id, downloadPassword);
            }}>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  placeholder="Enter file password"
                  autoFocus
                  value={downloadPassword}
                  onChange={e => setDownloadPassword(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button 
                  type="button" 
                  className="btn-outline" 
                  onClick={() => setPasswordPromptFile(null)} 
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-red" 
                  style={{ flex: 1.2 }}
                >
                  Confirm Download
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
