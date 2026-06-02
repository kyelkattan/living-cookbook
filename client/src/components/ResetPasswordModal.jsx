import { useState, useEffect } from 'react';

export default function ResetPasswordModal({ token, onClose, onDone }) {
  const [status, setStatus] = useState('validating'); // 'validating' | 'form' | 'success' | 'invalid'
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/validate-reset-token/${token}`)
      .then(r => {
        if (r.ok) setStatus('form');
        else return r.json().then(b => { setError(b.error); setStatus('invalid'); });
      })
      .catch(() => { setError('Could not verify reset link. Please try again.'); setStatus('invalid'); });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reset Password</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {status === 'validating' && (
          <p style={{ color: 'var(--text-muted)' }}>Verifying reset link…</p>
        )}

        {status === 'invalid' && (
          <>
            <p className="form-error" style={{ marginBottom: '1.5rem' }}>
              {error || 'This reset link is invalid or has expired.'}
            </p>
            <button className="btn btn-ghost btn-full" onClick={onClose}>Close</button>
          </>
        )}

        {status === 'success' && (
          <>
            <p style={{ marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button className="btn btn-primary btn-full" onClick={onDone}>Sign In</button>
          </>
        )}

        {status === 'form' && (
          <form onSubmit={handleSubmit}>
            {error && <p className="form-error">{error}</p>}

            <div className="form-group">
              <label htmlFor="reset-password">New Password</label>
              <input
                id="reset-password"
                className="form-input"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="reset-confirm">Confirm Password</label>
              <input
                id="reset-confirm"
                className="form-input"
                type="password"
                placeholder="Re-enter new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
