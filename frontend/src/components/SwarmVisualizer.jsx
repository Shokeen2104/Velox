import { useState, useEffect, useRef } from 'react';
import { swarmManager } from '../utils/SwarmManager';

export default function SwarmVisualizer() {
  const [swarmState, setSwarmState] = useState({ peers: [], downloads: [] });
  const canvasRef = useRef(null);

  useEffect(() => {
    const handleStateChange = (state) => {
      setSwarmState({ ...state });
    };
    
    swarmManager.addListener(handleStateChange);
    
    return () => {
      swarmManager.removeListener(handleStateChange);
    };
  }, []);

  // Native HTML5 Canvas Particle Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const nodeCount = 15 + (swarmState.peers.length * 5);
    const particles = [];
    
    for (let i = 0; i < nodeCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius: Math.random() * 2 + 1.5
      });
    }

    let animationFrameId;
    
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        
        // Move
        p.x += p.vx;
        p.y += p.vy;
        
        // Bounce
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        
        // Draw Dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        
        // Draw Connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            // Opacity fades as they get further apart
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.4 * (1 - dist / 120)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
    };
    
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [swarmState.peers.length]);

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
        <canvas 
          ref={canvasRef} 
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
