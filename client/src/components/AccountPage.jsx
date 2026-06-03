import { useState } from 'react';
import { supabase } from '../lib/supabase';

const USERNAME_RE = /^[a-zA-Z0-9_]{2,20}$/;

export default function AccountPage({ user, onUpdateUser }) {
  // ── Change username ──────────────────────────────────────────
  const [username, setUsername] = useState(user.username || '');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setUsernameError('');
    setUsernameSuccess('');

    const next = username.trim();
    if (!USERNAME_RE.test(next)) {
      return setUsernameError('Username must be 2–20 characters: letters, numbers, and underscores only');
    }
    if (next.toLowerCase() === (user.username || '').toLowerCase()) {
      return setUsernameError('That is already your username');
    }

    setUsernameLoading(true);
    try {
      // Soft uniqueness check (case-insensitive), ignoring our own row
      const { data: existing, error: lookupErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', next)
        .neq('id', user.id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (existing) throw new Error('That username is already taken');

      // Update the profiles row (RLS: users can update their own profile)
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ username: next })
        .eq('id', user.id);
      if (profileErr) {
        // Unique-constraint violation races land here
        throw new Error(profileErr.code === '23505'
          ? 'That username is already taken'
          : profileErr.message);
      }

      // Keep auth metadata in sync — the app reads username from there on load
      const { error: metaErr } = await supabase.auth.updateUser({ data: { username: next } });
      if (metaErr) throw metaErr;

      onUpdateUser({ ...user, username: next });
      setUsername(next);
      setUsernameSuccess('Username updated.');
    } catch (err) {
      setUsernameError(err.message);
    } finally {
      setUsernameLoading(false);
    }
  };

  // ── Change password ──────────────────────────────────────────
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!current) return setPasswordError('Enter your current password');
    if (password.length < 8) return setPasswordError('New password must be at least 8 characters');
    if (password !== confirm) return setPasswordError('New passwords do not match');
    if (password === current) return setPasswordError('New password must be different from your current one');

    setPasswordLoading(true);
    try {
      // Verify the current password by re-authenticating (Supabase has no direct
      // "check password" call — a successful sign-in confirms it).
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (verifyErr) throw new Error('Current password is incorrect');

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      setCurrent(''); setPassword(''); setConfirm('');
      setPasswordSuccess('Password updated.');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="recipe-form account-page">
      <h1>// ACCOUNT SETTINGS //</h1>

      <section className="account-section">
        <h2>Change Username</h2>
        <form onSubmit={handleUsernameSubmit}>
          {usernameError && <p className="form-error">{usernameError}</p>}
          {usernameSuccess && <p className="form-success">{usernameSuccess}</p>}

          <div className="form-group">
            <label htmlFor="account-username">Username</label>
            <input
              id="account-username"
              className="form-input"
              type="text"
              placeholder="letters, numbers, underscores"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={2}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
            />
            <p className="form-hint">2–20 characters · letters, numbers, and underscores · must be unique</p>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={usernameLoading}>
            {usernameLoading ? 'Saving…' : 'Save Username'}
          </button>
        </form>
      </section>

      <section className="account-section">
        <h2>Change Password</h2>
        <form onSubmit={handlePasswordSubmit}>
          {passwordError && <p className="form-error">{passwordError}</p>}
          {passwordSuccess && <p className="form-success">{passwordSuccess}</p>}

          <div className="form-group">
            <label htmlFor="account-current">Current Password</label>
            <input
              id="account-current"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="account-new">New Password</label>
            <input
              id="account-new"
              className="form-input"
              type="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="account-confirm">Confirm New Password</label>
            <input
              id="account-confirm"
              className="form-input"
              type="password"
              placeholder="Re-enter new password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={passwordLoading}>
            {passwordLoading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </section>
    </div>
  );
}
