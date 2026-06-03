import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DAILY_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatReset(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric',
  });
}

// Strip the "data:<type>;base64," prefix the FileReader adds.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImportRecipeModal({ onClose, onImported }) {
  const [tab, setTab] = useState('text'); // 'text' | 'image'
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(null); // null = loading
  const [resetsAt, setResetsAt] = useState(null);

  // Load the user's remaining quota for today (RLS scopes this to their own rows).
  useEffect(() => {
    let active = true;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    supabase
      .from('import_logs')
      .select('created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const used = data?.length ?? 0;
        setRemaining(Math.max(0, DAILY_LIMIT - used));
        setResetsAt(used > 0 ? new Date(new Date(data[0].created_at).getTime() + WINDOW_MS).toISOString() : null);
      });
    return () => { active = false; };
  }, []);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setError('');
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const canSubmit = !loading && remaining > 0 && (tab === 'text' ? text.trim().length > 0 : !!file);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      let body;
      if (tab === 'text') {
        body = { type: 'text', text };
      } else {
        const data = await fileToBase64(file);
        body = { type: 'image', image: { media_type: file.type, data } };
      }

      const { data: result, error: fnErr } = await supabase.functions.invoke('import-recipe', { body });
      if (fnErr) throw new Error('Something went wrong reaching the import service. Please try again.');

      if (!result?.ok) {
        if (typeof result?.remaining === 'number') setRemaining(result.remaining);
        if (result?.resetsAt) setResetsAt(result.resetsAt);
        setError(result?.error || "We couldn't import that. Please try again.");
        return;
      }

      if (typeof result.remaining === 'number') setRemaining(result.remaining);
      if (result.resetsAt) setResetsAt(result.resetsAt);
      onImported(result.recipe);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Recipe</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <p className="import-intro">
          Paste a recipe or upload a photo and Claude will fill in the form for you.
          You can review and edit everything before saving.
        </p>

        <div className="import-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'text'}
            className={`import-tab${tab === 'text' ? ' import-tab-active' : ''}`}
            onClick={() => { setTab('text'); setError(''); }}
          >
            Paste Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'image'}
            className={`import-tab${tab === 'image' ? ' import-tab-active' : ''}`}
            onClick={() => { setTab('image'); setError(''); }}
          >
            Upload Image
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        {tab === 'text' ? (
          <textarea
            className="form-textarea import-textarea"
            rows={9}
            placeholder="Paste a recipe from a website, your notes, anywhere…"
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={loading}
          />
        ) : (
          <div className="import-image">
            {preview ? (
              <div className="image-preview">
                <img src={preview} alt="Recipe to import" />
                {!loading && (
                  <button
                    type="button"
                    className="image-preview-remove"
                    onClick={() => { setFile(null); setPreview(null); setError(''); }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <label className="image-upload-zone" htmlFor="import-image-input">
                <span>Click to choose a photo</span>
                <span className="image-upload-hint">JPG, PNG, or WebP · max 5 MB</span>
              </label>
            )}
            <input
              id="import-image-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
              style={{ display: 'none' }}
              disabled={loading}
            />
          </div>
        )}

        {loading && (
          <p className="import-loading">✦ Reading your recipe with Claude… this can take a few seconds.</p>
        )}

        <div className="import-footer">
          <span className="import-remaining">
            {remaining === null
              ? 'Checking your imports…'
              : remaining > 0
                ? `${remaining} of ${DAILY_LIMIT} imports remaining today`
                : `No imports left today${resetsAt ? ` — resets ${formatReset(resetsAt)}` : ''}`}
          </span>
          <div className="import-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
              {loading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
