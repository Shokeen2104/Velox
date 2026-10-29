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
    <div className="glass-panel" style={{
      background: 'var(--bg-dark, #0f172a)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span>P2P Transfer Status</span>
        </h3>
        
        {/* Simple live status pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.85rem',
          borderRadius: '9999px',
          fontSize: '0.8rem',
          fontWeight: 600,
          background: hasActivePeer ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)',
          color: hasActivePeer ? '#10b981' : '#94a3b8',
          border: `1px solid ${hasActivePeer ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: hasActivePeer ? '#10b981' : '#64748b',
            display: 'inline-block'
          }}></span>
          {hasActivePeer ? 'Peer Connected' : 'Awaiting Peer'}
        </div>
      </div>

      {/* Connection details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '1rem',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Signaling Server
          </div>
          <div style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            marginTop: '0.35rem',
            color: isSignalingConnected ? '#10b981' : '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <span>●</span> {isSignalingConnected ? 'Online (Socket.IO)' : 'Connecting...'}
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '1rem',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Direct WebRTC Peer
          </div>
          <div style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            marginTop: '0.35rem',
            color: hasActivePeer ? '#38bdf8' : '#94a3b8',
            fontFamily: 'monospace'
          }}>
            {hasActivePeer ? `${peerState.peers[0].substring(0, 10)}...` : 'None active'}
          </div>
        </div>
      </div>

      {/* Active 1-to-1 Transfers */}
      <div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
          Active Transfers
        </div>
        
        {peerState.downloads.length === 0 ? (
          <div style={{
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: '#64748b',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '10px'
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
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#f1f5f9' }}>
                  {dl.file.file_name}
                </span>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: dl.status === 'complete' ? '#10b981' : '#f43f5e'
                }}>
                  {dl.status === 'complete' ? 'Completed' : `${Math.round(dl.progress || 0)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
