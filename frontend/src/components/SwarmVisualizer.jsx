import { useState, useEffect } from 'react';
import { swarmManager } from '../utils/SwarmManager';
import { signalingManager } from '../utils/SignalingManager';

export default function SwarmVisualizer() {
  const [peerState, setPeerState] = useState({ peers: [], downloads: [] });
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);

  useEffect(() => {
    const handleStateChange = (state) => {
      setPeerState({ ...state });
    };
    
    swarmManager.addListener(handleStateChange);
    
    // Check signaling socket status periodically
    const checkSignaling = () => {
      setIsSignalingConnected(!!signalingManager.socket?.connected);
    };
    checkSignaling();
    const interval = setInterval(checkSignaling, 1000);

    return () => {
      swarmManager.removeListener(handleStateChange);
      clearInterval(interval);
    };
  }, []);

  const hasActivePeer = peerState.peers.length > 0;

  return (
    <div className="dark-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
        <h3 className="card-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          P2P Transfer Status
        </h3>
        
        {/* Live status pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '0.72rem',
          fontWeight: 500,
          background: 'var(--bg-pill)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-pill)'
        }}>
          <span className={`status-dot ${hasActivePeer ? 'green' : 'gray'}`}></span>
          <span>{hasActivePeer ? `${peerState.peers.length} Peer Connected` : 'Awaiting Peer'}</span>
        </div>
      </div>

      {/* Connection details: 2 stat boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-label">Signaling Server</div>
          <div className="stat-value">
            <span className={`status-dot ${isSignalingConnected ? 'green' : 'amber'}`}></span>
            <span style={{ color: isSignalingConnected ? 'var(--status-green)' : 'var(--status-amber)' }}>
              {isSignalingConnected ? 'Online (Socket.IO)' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Direct WebRTC Peer</div>
          <div className="stat-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
            {hasActivePeer ? (
              <span style={{ color: 'var(--text-primary)' }}>
                {peerState.peers[0].length > 12 ? `${peerState.peers[0].substring(0, 12)}...` : peerState.peers[0]}
              </span>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>None active</span>
            )}
          </div>
        </div>
      </div>

      {/* Active Transfers */}
      <div>
        <div className="stat-label" style={{ marginBottom: '0.65rem' }}>
          Active Transfers
        </div>
        
        {peerState.downloads.length === 0 ? (
          <div style={{
            padding: '1.25rem',
            textAlign: 'center',
            fontSize: '0.82rem',
            color: 'var(--text-dim)',
            background: 'var(--bg-inset)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)'
          }}>
            No active peer transfers
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {peerState.downloads.map((dl, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                background: 'var(--bg-inset)',
                borderRadius: '8px',
                border: '1px solid var(--border-card)'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dl.file.file_name}
                </span>
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: dl.status === 'complete' ? 'var(--status-green)' : 'var(--accent-red)'
                }}>
                  {dl.status === 'complete' ? 'Done' : `${Math.round(dl.progress || 0)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
