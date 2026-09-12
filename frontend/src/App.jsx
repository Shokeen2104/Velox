import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import FileRegister from './components/FileRegister';
import FileList from './components/FileList';
import SwarmVisualizer from './components/SwarmVisualizer';
import { ToastProvider } from './components/Toast';
import { signalingManager } from './utils/SignalingManager';
import { swarmManager } from './utils/SwarmManager';

function App() {
  const [token, setToken] = useState(
    localStorage.getItem('velox_token') || localStorage.getItem('swarmshare_token') || null
  );
  const [activeTab, setActiveTab] = useState('home');
  const [peerCount, setPeerCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      signalingManager.disconnect();
      navigate('/login');
    } else {
      signalingManager.connect(token);
    }
  }, [token, navigate]);

  useEffect(() => {
    const handleState = (state) => {
      setPeerCount(state.peers.length);
    };
    swarmManager.addListener(handleState);
    return () => swarmManager.removeListener(handleState);
  }, []);

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('velox_token');
    localStorage.removeItem('swarmshare_token');
    navigate('/login');
  };

  const handleFileRegistered = (fileId, fileRef) => {
    console.log(`File registered! DB ID: ${fileId}. Retained file reference for seeding.`);
    swarmManager.startSeeding(fileId, fileRef);
    setRefreshKey(k => k + 1); // Trigger FileList to re-fetch
  };

  return (
    <>
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
          <h1 className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem' }}>
            <div className="glowing-dot"></div>
            VELOX
          </h1>
          {token && (
            <div className="tabs-container" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
              <button 
                className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => setActiveTab('home')}
              >
                Home
              </button>
              <button 
                className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
                onClick={() => setActiveTab('downloads')}
              >
                My Downloads
              </button>
              <button 
                className={`tab-btn ${activeTab === 'uploads' ? 'active' : ''}`}
                onClick={() => setActiveTab('uploads')}
              >
                My Uploads
              </button>
            </div>
          )}
        </div>
        {token && (
          <button 
            onClick={handleLogout} 
            className="btn" 
            style={{ background: 'transparent', border: '1px solid var(--glass-border)', padding: '0.5rem 1rem' }}
          >
            Logout
          </button>
        )}
      </header>

      <ToastProvider>
        <main className="container">
          <Routes>
            <Route path="/login" element={token ? <Navigate to="/files" /> : <Auth setToken={setToken} />} />
            <Route path="/files" element={
              token ? (
                <div>
                  <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontWeight: 800 }}>Your Dashboard</h2>
                  <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '1.5rem', maxWidth: '600px', lineHeight: '1.6' }}>
                    Register files to seed them, or pull files shared by peers across the swarm.
                  </p>
                  
                  <div className="peer-badge" style={{ marginBottom: '3rem' }}>
                    <div className="glowing-dot" style={{ 
                      background: peerCount > 0 ? 'var(--success)' : '#ef4444', 
                      boxShadow: `0 0 8px ${peerCount > 0 ? 'var(--success)' : '#ef4444'}` 
                    }}></div>
                    {peerCount} {peerCount === 1 ? 'peer' : 'peers'} connected
                  </div>
                  
                  {activeTab === 'home' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '3rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <FileRegister token={token} onFileRegistered={handleFileRegistered} />
                        <SwarmVisualizer />
                      </div>
                      <div>
                        <FileList token={token} activeTab={activeTab} refreshKey={refreshKey} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                      <FileList token={token} activeTab={activeTab} refreshKey={refreshKey} />
                    </div>
                  )}
                </div>
              ) : <Navigate to="/login" />
            } />
            <Route path="*" element={<Navigate to="/files" />} />
          </Routes>
        </main>
      </ToastProvider>
    </>
  );
}

export default App;
