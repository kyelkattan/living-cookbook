import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Friends management UI for the account page. Uses only the existing RPC
// endpoints (friends_list, friend_requests_incoming/outgoing,
// send/accept/decline/cancel request, remove_friend).
export default function FriendsManager({ onFriendsChanged }) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'sent'
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  // Add-friend search
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [searchErr, setSearchErr] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [f, i, o] = await Promise.all([
        supabase.rpc('friends_list'),
        supabase.rpc('friend_requests_incoming'),
        supabase.rpc('friend_requests_outgoing'),
      ]);
      if (f.error) throw f.error;
      if (i.error) throw i.error;
      if (o.error) throw o.error;
      setFriends(f.data || []);
      setIncoming(i.data || []);
      setOutgoing(o.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh our own lists and let the parent refresh its badge count.
  const refresh = async () => {
    setConfirmRemoveId(null);
    await load();
    onFriendsChanged?.();
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSearchErr('');
    setSearchMsg('');
    const name = query.trim();
    if (!name) return;
    setSending(true);
    try {
      const { data, error: err } = await supabase.rpc('send_friend_request', { p_username: name });
      if (err) throw err;
      // send_friend_request auto-accepts when the target already invited us.
      setSearchMsg(data?.status === 'accepted'
        ? `You're now friends with ${name}!`
        : `Friend request sent to ${name}.`);
      setQuery('');
      await refresh();
    } catch (err) {
      setSearchErr(err.message);
    } finally {
      setSending(false);
    }
  };

  // All per-row actions take a friendship id and share the same shape.
  const runAction = async (rpcName, friendshipId) => {
    setError('');
    try {
      const { error: err } = await supabase.rpc(rpcName, { p_friendship_id: friendshipId });
      if (err) throw err;
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const tabs = [
    { key: 'friends', label: 'Friends', count: friends.length },
    { key: 'requests', label: 'Requests', count: incoming.length },
    { key: 'sent', label: 'Sent', count: outgoing.length },
  ];

  return (
    <section className="account-section">
      <h2>Friends</h2>

      <form className="friend-search" onSubmit={handleSend}>
        <input
          className="form-input"
          type="text"
          placeholder="Find someone by username…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchErr(''); setSearchMsg(''); }}
          aria-label="Find a user by username"
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !query.trim()}>
          {sending ? 'Sending…' : 'Add Friend'}
        </button>
      </form>
      {searchErr && <p className="form-error">{searchErr}</p>}
      {searchMsg && <p className="form-success">{searchMsg}</p>}

      <div className="friend-tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`friend-tab${tab === t.key ? ' friend-tab-active' : ''}`}
            onClick={() => { setTab(t.key); setError(''); setConfirmRemoveId(null); }}
          >
            {t.label}{t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="friend-empty">Loading…</p>
      ) : (
        <div className="friend-list">
          {tab === 'friends' && (
            friends.length === 0
              ? <p className="friend-empty">No friends yet — search above to add some.</p>
              : friends.map(f => (
                <div key={f.friendship_id} className="friend-row">
                  <span className="friend-name">{f.username}</span>
                  {confirmRemoveId === f.friendship_id ? (
                    <span className="friend-actions">
                      <span className="friend-confirm-label">Remove?</span>
                      <button className="btn btn-danger btn-sm" onClick={() => runAction('remove_friend', f.friendship_id)}>Yes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemoveId(null)}>No</button>
                    </span>
                  ) : (
                    <span className="friend-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemoveId(f.friendship_id)}>Remove</button>
                    </span>
                  )}
                </div>
              ))
          )}

          {tab === 'requests' && (
            incoming.length === 0
              ? <p className="friend-empty">No incoming requests.</p>
              : incoming.map(r => (
                <div key={r.friendship_id} className="friend-row">
                  <span className="friend-name">{r.username}</span>
                  <span className="friend-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => runAction('accept_friend_request', r.friendship_id)}>Accept</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => runAction('decline_friend_request', r.friendship_id)}>Decline</button>
                  </span>
                </div>
              ))
          )}

          {tab === 'sent' && (
            outgoing.length === 0
              ? <p className="friend-empty">No pending sent requests.</p>
              : outgoing.map(r => (
                <div key={r.friendship_id} className="friend-row">
                  <span className="friend-name">{r.username}</span>
                  <span className="friend-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => runAction('cancel_friend_request', r.friendship_id)}>Cancel</button>
                  </span>
                </div>
              ))
          )}
        </div>
      )}
    </section>
  );
}
