import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthModal({ onClose, onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const switchMode = (m) => { setMode(m); setError(''); setConfirm(''); setUsername(''); setForgotSent(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirm) return setError('Passwords do not match');

    setLoading(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (err) throw err;
        setForgotSent(true);
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        if (!username.match(/^[a-zA-Z0-9_]{2,20}$/)) {
          throw new Error('Username must be 2–20 characters: letters, numbers, and underscores only');
        }

        // Soft uniqueness check before signUp
        const { data: existing } = await supabase
          .from('profiles')
          .select('username')
          .ilike('username', username)
          .maybeSingle();
        if (existing) throw new Error('That username is already taken');

        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (signUpErr) throw signUpErr;

        if (data.user && data.session) {
          // Email confirmation is disabled — user is immediately active
          onAuth({ id: data.user.id, email: data.user.email, username });
        } else {
          // Email confirmation is enabled — ask them to check inbox
          setError('Account created! Check your email to confirm your address, then sign in.');
          setLoading(false);
        }
        return;
      }

      // login
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      onAuth({
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username || '',
      });
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
              {mode === 'register' && (
                <div className="form-group">
                  <label htmlFor="auth-username">Username</label>
                  <input
                    id="auth-username"
                    className="form-input"
                    type="text"
                    placeholder="letters, numbers, underscores"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoFocus
                    minLength={2}
                    maxLength={20}
                    pattern="[a-zA-Z0-9_]+"
                  />
                </div>
              )}

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
                  autoFocus={mode !== 'register'}
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
