import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import FileRegister from './components/FileRegister';
import FileList from './components/FileList';
import SwarmVisualizer from './components/SwarmVisualizer';
import { signalingManager } from './utils/SignalingManager';
import { swarmManager } from './utils/SwarmManager';

function App() {
  const [token, setToken] = useState(localStorage.getItem('swarmshare_token') || null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      signalingManager.disconnect();
      navigate('/login');
    } else {
      signalingManager.connect(token);
    }
  }, [token, navigate]);

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('swarmshare_token');
    navigate('/login');
  };

  const handleFileRegistered = (fileId, fileRef) => {
    console.log(`File registered! DB ID: ${fileId}. Retained file reference for seeding.`);
    swarmManager.startSeeding(fileId, fileRef);
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">SwarmShare</h1>
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

      <main className="container">
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/files" /> : <Auth setToken={setToken} />} />
          <Route path="/files" element={
            token ? (
              <div>
                <h2>Your Dashboard</h2>
                <p>Welcome! You can register files to seed them, or download files shared by others.</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div>
                    <FileRegister token={token} onFileRegistered={handleFileRegistered} />
                    <SwarmVisualizer />
                  </div>
                  <div>
                    <FileList token={token} />
                  </div>
                </div>
              </div>
            ) : <Navigate to="/login" />
          } />
          <Route path="*" element={<Navigate to="/files" />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
