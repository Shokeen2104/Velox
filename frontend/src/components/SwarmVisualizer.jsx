import { useState, useEffect, useCallback } from 'react';
import Particles from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { swarmManager } from '../utils/SwarmManager';

export default function SwarmVisualizer() {
  const [swarmState, setSwarmState] = useState({ peers: [], downloads: [] });

  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  useEffect(() => {
    const handleStateChange = (state) => {
      setSwarmState({ ...state });
    };
    
    swarmManager.addListener(handleStateChange);
    
    return () => {
      swarmManager.removeListener(handleStateChange);
    };
  }, []);

  // Use the number of peers to increase the number of nodes in the visualization
  // Base nodes = 5, plus 5 per peer
  const nodeCount = 5 + (swarmState.peers.length * 5);

  return (
    <div style={{
      background: 'var(--bg-dark)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', marginBottom: '1rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Swarm Network Visualization</h3>
      </div>
      
      <div style={{ position: 'relative', height: '220px', background: '#0a0f1d' }}>
        <Particles
          id="tsparticles"
          init={particlesInit}
          options={{
            background: {
              color: { value: "transparent" },
            },
            fpsLimit: 60,
            interactivity: {
              events: {
                onHover: { enable: true, mode: "grab" },
              },
              modes: {
                grab: { distance: 140, links: { opacity: 0.5 } }
              },
            },
            particles: {
              color: { value: "#10b981" },
              links: {
                color: "#10b981",
                distance: 150,
                enable: true,
                opacity: 0.2,
                width: 1,
              },
              move: {
                direction: "none",
                enable: true,
                outModes: { default: "bounce" },
                random: false,
                speed: 1,
                straight: false,
              },
              number: {
                density: { enable: true, area: 800 },
                value: nodeCount,
              },
              opacity: { value: 0.5 },
              shape: { type: "circle" },
              size: { value: { min: 2, max: 4 } },
            },
            detectRetina: true,
          }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        />
        
        {swarmState.peers.length === 0 && (
          <div style={{ 
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.75rem 1.5rem', borderRadius: '9999px', pointerEvents: 'none'
          }}>
            <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.9rem' }}>
              awaiting peer connections...
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ padding: '1.5rem', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ fontSize: '0.8rem', color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Connected Peers (WebRTC)
          </h4>
          {swarmState.peers.length === 0 ? (
            <div style={{ fontFamily: 'monospace', color: '#94a3b8' }}>&mdash; none active &mdash;</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {swarmState.peers.map((peerId, idx) => (
                <div key={idx} style={{ fontFamily: 'monospace', color: 'var(--success)' }}>
                  &bull; {peerId.substring(0, 12)}...
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '0.8rem', color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Active Downloads
          </h4>
          {swarmState.downloads.length === 0 ? (
            <div style={{ fontFamily: 'monospace', color: '#94a3b8' }}>&mdash; none active &mdash;</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {swarmState.downloads.map((dl, idx) => (
                <div key={idx} style={{ fontFamily: 'monospace', color: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{dl.file.file_name}</span>
                  <span style={{ color: dl.status === 'complete' ? 'var(--success)' : 'var(--primary)' }}>
                    {dl.status === 'complete' ? 'DONE' : `${Math.round(dl.progress || 0)}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
