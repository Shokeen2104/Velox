import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Auth({ setToken }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setToken(data.token);
      localStorage.setItem('velox_token', data.token);
      localStorage.setItem('swarmshare_token', data.token);
      navigate('/files');
    } catch (err) {
      if (err.message === 'Failed to fetch' || err.message === 'Invalid credentials') {
        setError('No user detected or incorrect password');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem 1.5rem'
    }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
          <span className="status-dot green" style={{ width: '9px', height: '9px' }}></span>
          <span className="brand-title" style={{ fontSize: '1.9rem', letterSpacing: '0.08em' }}>VELOX</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, letterSpacing: '0.02em' }}>
          Peer-to-Peer Encrypted File Swarm
        </p>
      </div>

      {/* Main Auth Card */}
      <div className="dark-card" style={{ width: '100%', maxWidth: '420px', padding: '2.2rem' }}>
        {/* Tab switcher: Sign In / Sign Up */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.8rem' }}>
          <div className="nav-tabs-wrapper" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className={`nav-tab-btn ${isLogin ? 'active' : ''}`}
              style={{ textAlign: 'center' }}
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${!isLogin ? 'active' : ''}`}
              style={{ textAlign: 'center' }}
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
            >
              Sign Up
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 71, 66, 0.12)',
            border: '1px solid rgba(255, 71, 66, 0.3)',
            color: 'var(--status-red)',
            padding: '9px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span className="status-dot red"></span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              placeholder="name@example.com"
              className="form-input"
              autoComplete="email"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.6rem' }}>
            <label className="form-label">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
              className="form-input"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          <button 
            type="submit" 
            className="btn-red" 
            style={{ width: '100%', padding: '11px 16px', fontSize: '0.82rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : (isLogin ? 'SIGN IN' : 'CREATE ACCOUNT')}
          </button>
        </form>

        <div style={{ 
          textAlign: 'center', 
          marginTop: '1.5rem', 
          fontSize: '0.82rem', 
          color: 'var(--text-muted)' 
        }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span 
            style={{ 
              color: 'var(--accent-red)', 
              cursor: 'pointer', 
              fontWeight: 600,
              marginLeft: '4px'
            }} 
            onClick={() => {
              setIsLogin(!isLogin);
              setEmail('');
              setPassword('');
              setError('');
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </span>
        </div>
      </div>

      {/* Protocol watermark */}
      <div style={{
        marginTop: '2.5rem',
        fontSize: '0.74rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span className="status-dot green"></span>
        <span>VELOX P2P Network Protocol v2.4</span>
        <span style={{ color: 'var(--text-dim)' }}>•</span>
        <span>WebRTC Direct Swarm</span>
      </div>
    </div>
  );
}
