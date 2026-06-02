import { useState } from 'react';

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const switchMode = (m) => { setMode(m); setError(''); setConfirm(''); setForgotSent(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirm) return setError('Passwords do not match');

    setLoading(true);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
        setForgotSent(true);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Something went wrong'); }
      onAuth(await res.json());
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const title = mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Forgot Password';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {mode === 'forgot' && forgotSent ? (
          <>
            <p style={{ marginBottom: '1.5rem', lineHeight: 1.6 }}>
              If an account with that email exists, a reset link is on its way. Check your inbox (and spam folder).
            </p>
            <button className="btn btn-ghost btn-full" onClick={() => switchMode('login')}>
              Back to Sign In
            </button>
          </>
        ) : (
          <>
            {error && <p className="form-error">{error}</p>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {mode !== 'forgot' && (
                <div className="form-group">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    className="form-input"
                    type="password"
                    placeholder={mode === 'register' ? 'Minimum 8 characters' : ''}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                  />
                </div>
              )}

              {mode === 'register' && (
                <div className="form-group">
                  <label htmlFor="auth-confirm">Confirm Password</label>
                  <input
                    id="auth-confirm"
                    className="form-input"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
              )}

              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: '-0.75rem', marginBottom: '1rem' }}>
                  <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                    Forgot password?
                  </button>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Please wait…'
                  : mode === 'login' ? 'Sign In'
                  : mode === 'register' ? 'Create Account'
                  : 'Send Reset Link'}
              </button>
            </form>

            <p className="auth-toggle">
              {mode === 'login' ? (
                <>No account? <button type="button" onClick={() => switchMode('register')}>Create one</button></>
              ) : mode === 'register' ? (
                <>Already have an account? <button type="button" onClick={() => switchMode('login')}>Sign in</button></>
              ) : (
                <button type="button" onClick={() => switchMode('login')}>Back to Sign In</button>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
