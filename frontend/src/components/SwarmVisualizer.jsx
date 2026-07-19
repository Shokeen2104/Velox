import { useState, useEffect } from 'react';
import { swarmManager } from '../utils/SwarmManager';

export default function SwarmVisualizer() {
  const [swarmState, setSwarmState] = useState({ peers: [], downloads: [] });

  useEffect(() => {
    swarmManager.onStateChange = (state) => {
      // Force re-render with new state
      setSwarmState({ ...state });
    };
    return () => {
      swarmManager.onStateChange = null;
    };
  }, []);

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <h3>Swarm Network Visualization</h3>
      
      <div style={{ marginTop: '1rem' }}>
        <h4>Connected Peers (WebRTC)</h4>
        {swarmState.peers.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No active peer connections.</div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {swarmState.peers.map((peerId, idx) => (
              <div key={idx} style={{ 
                background: 'rgba(34, 197, 94, 0.2)', 
                border: '1px solid var(--success)',
                padding: '0.5rem 1rem', 
                borderRadius: '9999px',
                fontSize: '0.8rem'
              }}>
                🟢 Peer: {peerId.substring(0, 8)}...
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h4>Active Downloads</h4>
        {swarmState.downloads.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No active downloads.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {swarmState.downloads.map((dl, idx) => (
              <div key={idx} style={{ 
                background: 'rgba(0, 0, 0, 0.2)', 
                padding: '1rem', 
                borderRadius: '8px',
                border: '1px solid var(--glass-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>{dl.file.file_name}</strong>
                  <span style={{ 
                    color: dl.status === 'complete' ? 'var(--success)' : 
                           dl.status === 'downloading' ? 'var(--primary)' : '#94a3b8' 
                  }}>
                    {dl.status.toUpperCase()}
                  </span>
                </div>
                
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${dl.progress || 0}%`, background: dl.status === 'complete' ? 'var(--success)' : 'var(--primary)' }}></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.25rem', color: '#cbd5e1' }}>
                  {Math.round(dl.progress || 0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
