import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box, Typography, Button, IconButton, TextField, Chip,
  CircularProgress, Divider, Tooltip, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Add, Delete, Lock, LockOpen, LockOutlined, Search, Clear,
  NoteAlt, CheckCircle,
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../api/axios';
import CanvasSelector from '../components/CanvasSelector';
import { fetchCanvases } from '../features/canvas/canvasSlice';

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return format(d, 'MMM d');
}

// ── Global password management dialog ────────────────────────────────────────
// Handles: set / change / remove
function PasswordMgmtDialog({ open, hasPassword, onClose, onSuccess }) {
  const [step, setStep] = useState('menu'); // 'menu' | 'set' | 'change' | 'remove'
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setStep(hasPassword ? 'menu' : 'set'); setCurrent(''); setNext(''); setConfirm(''); setError(''); }
  }, [open, hasPassword]);

  const submit = async () => {
    setError('');
    if ((step === 'set' || step === 'change') && next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (step === 'set') {
        if (!next) { setError('Enter a password'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'set', password: next });
      } else if (step === 'change') {
        if (!current || !next) { setError('Fill all fields'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'change', currentPassword: current, password: next });
      } else if (step === 'remove') {
        if (!current) { setError('Enter current password'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'remove', currentPassword: current });
      }
      onSuccess(step);
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const titles = { menu: 'Password protection', set: 'Set a password', change: 'Change password', remove: 'Remove password' };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{titles[step]}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {step === 'menu' ? (
          <Box display="flex" flexDirection="column" gap={1.5} pt={0.5}>
            <Button fullWidth variant="outlined" onClick={() => { setStep('change'); setError(''); }}>Change password</Button>
            <Button fullWidth variant="outlined" color="error" onClick={() => { setStep('remove'); setError(''); }}>Remove password</Button>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} pt={0.5}>
            {(step === 'change' || step === 'remove') && (
              <TextField
                autoFocus fullWidth type="password" label="Current password"
                value={current} onChange={e => setCurrent(e.target.value)}
                inputProps={{ autoComplete: 'off' }}
                onKeyDown={e => { if (e.key === 'Enter' && step === 'remove') submit(); }}
              />
            )}
            {(step === 'set' || step === 'change') && (
              <TextField
                autoFocus={step === 'set'} fullWidth type="password" label="New password"
                value={next} onChange={e => { setNext(e.target.value); setError(''); }}
                inputProps={{ autoComplete: 'off' }}
              />
            )}
            {(step === 'set' || step === 'change') && (
              <TextField
                fullWidth type="password" label="Confirm new password"
                value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
                inputProps={{ autoComplete: 'off' }}
                error={!!error && error === 'Passwords do not match'}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
            )}
            {error && <Typography variant="caption" color="error">{error}</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={step === 'menu' ? onClose : () => { setStep(hasPassword ? 'menu' : 'set'); setError(''); }} variant="outlined">
          {step === 'menu' ? 'Close' : 'Back'}
        </Button>
        {step !== 'menu' && (
          <Button onClick={submit} variant="contained" color={step === 'remove' ? 'error' : 'primary'} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : step === 'remove' ? 'Remove' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Unlock screen ─────────────────────────────────────────────────────────────
function UnlockScreen({ onUnlocked }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/notes/unlock', { password: pw });
      onUnlocked();
    } catch (e) {
      setError(e.response?.data?.error || 'Incorrect password');
      setLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={2.5}>
      <Lock sx={{ fontSize: 56, color: '#94a3b8' }} />
      <Typography variant="h6" fontWeight={700} color="text.secondary">Notes are protected</Typography>
      <Typography variant="body2" color="text.disabled">Enter your password to unlock</Typography>
      <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} width={280}>
        <TextField
          autoFocus fullWidth type="password" label="Password" size="small"
          value={pw} onChange={e => setPw(e.target.value)}
          error={!!error} helperText={error || ''}
          inputProps={{ autoComplete: 'off' }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <Button fullWidth variant="contained" onClick={submit} disabled={loading || !pw}
          startIcon={loading ? <CircularProgress size={16} /> : <LockOpen />}
          sx={{ borderRadius: 2, textTransform: 'none' }}>
          Unlock
        </Button>
      </Box>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Notes() {
  const dispatch = useDispatch();
  const { activeCanvasId, canvases } = useSelector(s => ({
    activeCanvasId: s.canvas.activeCanvasId.notes,
    canvases: s.canvas.canvases,
  }));

  // Global password state
  const [hasPassword, setHasPassword] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwMgmtOpen, setPwMgmtOpen] = useState(false);

  // List state
  const [notes, setNotes] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchTimer = useRef(null);

  // Per-canvas note counts
  const [noteCounts, setNoteCounts] = useState({});

  // Selected / editor state
  const [selectedId, setSelectedId] = useState(null);
  const [editorNote, setEditorNote] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const saveTimer = useRef(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Creating
  const [creating, setCreating] = useState(false);

  // ── Load settings on mount ──────────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchCanvases());
    api.get('/notes/settings').then(r => {
      setHasPassword(r.data.hasPassword);
      if (!r.data.hasPassword) setIsUnlocked(true);
    }).catch(console.error);
  }, [dispatch]);

  // ── Fetch notes list ────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async (s = '', canvasId = undefined) => {
    setListLoading(true);
    try {
      const params = {};
      if (s) params.search = s;
      if (canvasId) params.canvasId = canvasId;
      const r = await api.get('/notes', { params });
      setNotes(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const r = await api.get('/notes');
      const map = {};
      r.data.forEach(n => { if (n.canvasId) map[n.canvasId] = (map[n.canvasId] || 0) + 1; });
      setNoteCounts(map);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (isUnlocked) { fetchNotes(search, activeCanvasId); refreshCounts(); }
  }, [activeCanvasId, isUnlocked]); // eslint-disable-line

  useEffect(() => {
    if (!isUnlocked) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchNotes(search, activeCanvasId), 300);
  }, [search]); // eslint-disable-line

  // ── Open note ───────────────────────────────────────────────────────────────
  const openNote = useCallback(async (note) => {
    setSelectedId(note.id);
    setSaveState('saved');
    try {
      const r = await api.get(`/notes/${note.id}`);
      setEditorNote(r.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Create note ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await api.post('/notes', { title: 'Untitled Note', content: '', canvasId: activeCanvasId || null });
      const newNote = r.data;
      setNotes(prev => [newNote, ...prev]);
      refreshCounts();
      setSelectedId(newNote.id);
      setEditorNote({ ...newNote, content: '' });
      setSaveState('saved');
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  // ── Auto-save ────────────────────────────────────────────────────────────────
  const persistSave = useCallback(async (id, data) => {
    setSaveState('saving');
    try {
      const r = await api.put(`/notes/${id}`, data);
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title: r.data.title, updatedAt: r.data.updatedAt } : n));
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
    }
  }, []);

  const handleEditorChange = useCallback((field, value) => {
    if (!editorNote) return;
    setEditorNote(prev => ({ ...prev, [field]: value }));
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSave(editorNote.id, { [field]: value }), 1000);
  }, [editorNote, persistSave]);

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editorNote) return;
    try {
      await api.delete(`/notes/${editorNote.id}`);
      setNotes(prev => prev.filter(n => n.id !== editorNote.id));
      setEditorNote(null);
      setSelectedId(null);
      setDeleteConfirm(false);
      refreshCounts();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Password management callbacks ────────────────────────────────────────────
  const handlePwSuccess = (step) => {
    if (step === 'set') { setHasPassword(true); setIsUnlocked(true); }
    else if (step === 'remove') { setHasPassword(false); setIsUnlocked(true); }
    // 'change' — remain unlocked
    setPwMgmtOpen(false);
  };

  const allNoteCounts = useMemo(() => noteCounts, [noteCounts]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <CanvasSelector screen="notes" countsByCanvas={allNoteCounts} />

      <Box sx={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden', borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'background.paper' }}>

        {/* ── Left panel ── */}
        <Box sx={{ width: 280, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography fontWeight={700} variant="subtitle1">Notes</Typography>
              <Box display="flex" gap={0.5}>
                {/* Password settings icon */}
                <Tooltip title={hasPassword ? 'Password settings' : 'Set a password'}>
                  <IconButton size="small" onClick={() => setPwMgmtOpen(true)}
                    sx={{ color: hasPassword ? '#6366f1' : 'text.disabled' }}>
                    {hasPassword ? <Lock sx={{ fontSize: 16 }} /> : <LockOpen sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
                {/* Lock now button — only visible when notes are unlocked and has password */}
                {hasPassword && isUnlocked && (
                  <Tooltip title="Lock notes">
                    <IconButton size="small" onClick={() => setIsUnlocked(false)} sx={{ color: '#94a3b8', '&:hover': { color: '#6366f1' } }}>
                      <LockOutlined sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Button size="small" variant="contained"
                  startIcon={creating ? <CircularProgress size={14} /> : <Add />}
                  onClick={handleCreate} disabled={creating || !isUnlocked}
                  sx={{ borderRadius: 2, textTransform: 'none', fontSize: '0.78rem', py: 0.5 }}>
                  New
                </Button>
              </Box>
            </Box>
            <TextField
              size="small" fullWidth placeholder="Search notes…" value={search}
              onChange={e => setSearch(e.target.value)} disabled={!isUnlocked}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}><Clear sx={{ fontSize: 14 }} /></IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>
          <Divider />
          {/* List */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {!isUnlocked ? (
              <Box textAlign="center" pt={6} px={2}>
                <Lock sx={{ fontSize: 36, color: '#c7d2fe', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">Unlock to view notes</Typography>
              </Box>
            ) : listLoading ? (
              <Box display="flex" justifyContent="center" pt={4}><CircularProgress size={24} /></Box>
            ) : notes.length === 0 ? (
              <Box textAlign="center" pt={6} px={2}>
                <NoteAlt sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  {search ? 'No notes match your search' : 'No notes yet. Click New to start.'}
                </Typography>
              </Box>
            ) : (
              notes.map(note => {
                const active = selectedId === note.id;
                const canvas = canvases.find(c => c.id === note.canvasId);
                return (
                  <Box key={note.id} onClick={() => openNote(note)}
                    sx={{
                      px: 2, py: 1.5, cursor: 'pointer', borderLeft: '3px solid',
                      borderLeftColor: active ? '#6366f1' : 'transparent',
                      bgcolor: active ? '#f5f3ff' : 'transparent',
                      borderBottom: '1px solid #f1f5f9',
                      '&:hover': { bgcolor: active ? '#f5f3ff' : '#f8fafc' },
                    }}>
                    <Typography variant="body2" fontWeight={600}
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? '#4f46e5' : 'text.primary' }}>
                      {note.title}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={0.75} mt={0.4} flexWrap="wrap">
                      <Typography variant="caption" color="text.disabled">{timeAgo(note.updatedAt)}</Typography>
                      {canvas && (
                        <Chip label={canvas.name} size="small"
                          sx={{ height: 16, fontSize: '0.6rem', bgcolor: canvas.color + '22', color: canvas.color, border: 'none', fontWeight: 600 }} />
                      )}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        {/* ── Right panel ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!isUnlocked ? (
            <UnlockScreen onUnlocked={() => { setIsUnlocked(true); fetchNotes(search, activeCanvasId); refreshCounts(); }} />
          ) : !editorNote ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" color="text.disabled">
              <NoteAlt sx={{ fontSize: 56, mb: 2 }} />
              <Typography variant="body1" color="text.secondary">Select a note to view or edit it</Typography>
              <Typography variant="caption" color="text.disabled" mt={0.5}>or click New to create one</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Toolbar */}
              <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box display="flex" alignItems="center" gap={0.5} sx={{ flex: 1 }}>
                  {saveState === 'saving' && <><CircularProgress size={12} /><Typography variant="caption" color="text.disabled">Saving…</Typography></>}
                  {saveState === 'saved' && <><CheckCircle sx={{ fontSize: 14, color: '#22c55e' }} /><Typography variant="caption" color="text.disabled">Saved</Typography></>}
                  {saveState === 'error' && <Typography variant="caption" color="error">Save failed</Typography>}
                </Box>
                <Tooltip title="Delete note">
                  <IconButton size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'text.disabled', '&:hover': { color: '#dc2626' } }}>
                    <Delete sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              {/* Title */}
              <Box sx={{ px: 3, pt: 2.5, pb: 0 }}>
                <TextField
                  fullWidth variant="standard" placeholder="Note title…"
                  value={editorNote.title} onChange={e => handleEditorChange('title', e.target.value)}
                  InputProps={{ disableUnderline: true, sx: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 } }}
                />
                <Typography variant="caption" color="text.disabled" mt={0.5} display="block">
                  Last edited {format(new Date(editorNote.updatedAt), 'MMM d, yyyy · h:mm a')}
                </Typography>
              </Box>
              <Divider sx={{ mx: 3, my: 1.5 }} />
              {/* Body */}
              <Box sx={{ flex: 1, px: 3, pb: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <TextField
                  fullWidth multiline variant="standard" placeholder="Start writing…"
                  value={editorNote.content} onChange={e => handleEditorChange('content', e.target.value)}
                  InputProps={{ disableUnderline: true, sx: { fontSize: '0.95rem', lineHeight: 1.7, alignItems: 'flex-start' } }}
                  sx={{
                    flex: 1,
                    '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' },
                    '& textarea': { height: '100% !important', resize: 'none', overflowY: 'auto !important' },
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Global password management */}
      <PasswordMgmtDialog
        open={pwMgmtOpen} hasPassword={hasPassword}
        onClose={() => setPwMgmtOpen(false)}
        onSuccess={handlePwSuccess}
      />

      {/* Delete confirm */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            <strong>{editorNote?.title}</strong> will be permanently deleted. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
