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
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div className="brand-wrapper" onClick={() => token && setActiveTab('home')}>
            <span className="status-dot green"></span>
            <span className="brand-title">VELOX</span>
          </div>

          {token && (
            <div className="nav-tabs-wrapper">
              <button 
                type="button"
                className={`nav-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => setActiveTab('home')}
              >
                All Files
              </button>
              <button 
                type="button"
                className={`nav-tab-btn ${activeTab === 'uploads' ? 'active' : ''}`}
                onClick={() => setActiveTab('uploads')}
              >
                My Uploads
              </button>
            </div>
          )}
        </div>

        {token && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="header-pill">
              <span className={`status-dot ${peerCount > 0 ? 'green' : 'red'}`}></span>
              <span>{peerCount} {peerCount === 1 ? 'peer' : 'peers'} connected</span>
            </div>
            <button 
              type="button"
              onClick={handleLogout} 
              className="logout-btn"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      <ToastProvider>
        <main className="app-container">
          <Routes>
            <Route path="/login" element={token ? <Navigate to="/files" /> : <Auth setToken={setToken} />} />
            <Route path="/files" element={
              token ? (
                <div>
                  {/* Dashboard Top Area */}
                  <div className="dashboard-top">
                    <div>
                      <h2 className="dashboard-heading">
                        {activeTab === 'home' ? 'Your Dashboard' : 'My Uploads'}
                      </h2>
                      <p className="dashboard-subheading">
                        {activeTab === 'home' 
                          ? 'Share files directly peer-to-peer via WebRTC, or download files shared by active peers.'
                          : 'Manage and monitor all files you have seeded and registered to the peer network.'}
                      </p>
                    </div>

                    <div className="mesh-status-pill">
                      <span className={`status-dot ${peerCount > 0 ? 'green' : 'red'}`}></span>
                      <span>Mesh Status: {peerCount > 0 ? 'Connected' : 'Standby'}</span>
                    </div>
                  </div>

                  {/* 2-Column Responsive Dashboard Layout */}
                  <div className="dashboard-grid">
                    {/* Left Column: Register file & Swarm Visualizer */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                      <FileRegister token={token} onFileRegistered={handleFileRegistered} />
                      <SwarmVisualizer />
                    </div>

                    {/* Right Column: File List */}
                    <div>
                      <FileList token={token} activeTab={activeTab} refreshKey={refreshKey} />
                    </div>
                  </div>
                </div>
              ) : <Navigate to="/login" />
            } />
            <Route path="*" element={<Navigate to="/files" />} />
          </Routes>
        </main>
      </ToastProvider>

      {/* Footer */}
      <footer className="app-footer">
        <div className="app-footer-left">
          <span className="status-dot green"></span>
          <span>VELOX P2P Network Protocol v2.4</span>
        </div>
        <div>
          <span>WebRTC Direct Swarm • End-to-End In-Browser Hashing</span>
        </div>
      </footer>
    </>
  );
}

export default App;
