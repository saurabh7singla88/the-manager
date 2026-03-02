import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Drawer, Box, Typography, IconButton, Tabs, Tab, Chip, Divider,
  TextField, Button, LinearProgress, Select, MenuItem, FormControl,
  Avatar, Tooltip, CircularProgress, InputAdornment, Slider,
  List, ListItem, ListItemAvatar, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions, InputLabel,
  Autocomplete
} from '@mui/material';
import {
  Close, Add, Delete, Edit, Link as LinkIcon, Comment,
  History, Info, OpenInNew, Send, CheckCircle, Label,
  CalendarToday, Person, TrendingUp, PersonAdd
} from '@mui/icons-material';
import api from '../api/axios';
import { updateInitiative, updateStatus, updatePriority, fetchAllInitiatives, fetchInitiatives } from '../features/initiatives/initiativesSlice';
import { format, formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe' },
  BLOCKED:     { label: 'Blocked',     color: '#b91c1c', bg: '#fee2e2' },
  ON_HOLD:     { label: 'On Hold',     color: '#b45309', bg: '#fef3c7' },
  COMPLETED:   { label: 'Completed',   color: '#065f46', bg: '#d1fae5' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2' },
  HIGH:     { color: '#d97706', bg: '#fffbeb' },
  MEDIUM:   { color: '#6366f1', bg: '#eff6ff' },
  LOW:      { color: '#64748b', bg: '#f1f5f9' },
};

const ACTION_LABELS = {
  created:          'Created this initiative',
  updated:          'Updated details',
  status_changed:   'Changed status',
  priority_changed: 'Changed priority',
  link_added:       'Added a link',
  comment_added:    'Left a comment',
};

function TabPanel({ value, idx, children }) {
  return value === idx ? <Box sx={{ flex: 1, overflowY: 'auto' }}>{children}</Box> : null;
}

export default function InitiativeDetailDrawer({ initiativeId, open, onClose }) {
  const dispatch = useDispatch();
  const { allItems, items } = useSelector(s => s.initiatives);
  const { user } = useSelector(s => s.auth);
  const { canvases } = useSelector(s => s.canvas);

  const allKnownItems = [...allItems, ...items];
  const initiative = allKnownItems.find(i => i.id === initiativeId) || null;

  const [tab, setTab] = useState(0);
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Links state
  const [links, setLinks] = useState([]);
  const [linkForm, setLinkForm] = useState({ url: '', title: '', description: '', category: '' });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [addingLink, setAddingLink] = useState(false);

  // Comments state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Activity state
  const [activity, setActivity] = useState([]);

  // Inline edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [users, setUsers] = useState([]);

  const allTags = useMemo(
    () => [...new Set([...(allItems || []), ...(items || [])].flatMap(i => i.tags || []))].sort(),
    [allItems, items]
  );

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  const fetchAll = useCallback(async (id) => {
    setLoading(true);
    try {
      const [fullRes, linksRes, commentsRes, activityRes] = await Promise.all([
        api.get(`/initiatives/${id}`),
        api.get(`/initiatives/${id}/links`),
        api.get(`/initiatives/${id}/comments`),
        api.get(`/initiatives/${id}/activity`),
      ]);
      setFullData(fullRes.data);
      setLinks(linksRes.data);
      setComments(commentsRes.data);
      setActivity(activityRes.data);
    } catch (e) {
      console.error('Failed to load initiative details', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && initiativeId) {
      setTab(0);
      fetchAll(initiativeId);
      api.get('/users').then(r => setUsers(r.data)).catch(() => {});
    }
  }, [open, initiativeId, fetchAll]);

  const handleQuickCreateUser = async (onCreated) => {
    if (!quickUserName.trim()) return;
    setQuickUserSaving(true);
    try {
      const r = await api.post('/users', { name: quickUserName.trim(), role: quickUserRole });
      setUsers(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      onCreated(r.data);
      setQuickUserOpen(false);
      setQuickUserName('');
      setQuickUserRole('VIEWER');
    } catch (err) {
      console.error('Failed to create user', err);
    } finally {
      setQuickUserSaving(false);
    }
  };

  const detail = fullData || initiative;

  // ── Overview edits ────────────────────────────────────────────
  const saveField = async (field, value) => {
    await dispatch(updateInitiative({ id: initiativeId, data: { [field]: value } }));
    dispatch(fetchAllInitiatives());
    dispatch(fetchInitiatives({ parentId: 'null' }));
    setFullData(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleStatusChange = async (status) => {
    await dispatch(updateStatus({ id: initiativeId, status }));
    dispatch(fetchAllInitiatives());
    setFullData(prev => prev ? { ...prev, status } : prev);
  };

  const handlePriorityChange = async (priority) => {
    await dispatch(updatePriority({ id: initiativeId, priority }));
    dispatch(fetchAllInitiatives());
    setFullData(prev => prev ? { ...prev, priority } : prev);
  };

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || (detail?.tags || []).includes(trimmed)) return;
    const newTags = [...(detail?.tags || []), trimmed];
    saveField('tags', newTags);
    setTagInput('');
  };

  const removeTag = (tag) => {
    saveField('tags', (detail?.tags || []).filter(t => t !== tag));
  };

  // ── Links ──────────────────────────────────────────────────────
  const handleAddLink = async () => {
    if (!linkForm.url.trim()) return;
    setAddingLink(true);
    try {
      const res = await api.post(`/initiatives/${initiativeId}/links`, linkForm);
      setLinks(prev => [res.data, ...prev]);
      setLinkForm({ url: '', title: '', description: '', category: '' });
      setShowLinkForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId) => {
    await api.delete(`/initiatives/links/${linkId}`);
    setLinks(prev => prev.filter(l => l.id !== linkId));
  };

  // ── Comments ───────────────────────────────────────────────────
  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const res = await api.post(`/initiatives/${initiativeId}/comments`, { content: commentText });
      setComments(prev => [...prev, res.data]);
      setCommentText('');
    } catch (e) {
      console.error(e);
    } finally {
      setSendingComment(false);
    }
  };

  const handleEditComment = async (commentId) => {
    if (!editingCommentText.trim()) return;
    const res = await api.put(`/initiatives/comments/${commentId}`, { content: editingCommentText });
    setComments(prev => prev.map(c => c.id === commentId ? res.data : c));
    setEditingCommentId(null);
  };

  const handleDeleteComment = async (commentId) => {
    await api.delete(`/initiatives/comments/${commentId}`);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <>
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: 480 },
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e2e8f0',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.1)',
        }
      }}
    >
      {loading || !detail ? (
        <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Header */}
          <Box sx={{ px: 3, pt: 2.5, pb: 0, borderBottom: '1px solid #f1f5f9' }}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Box sx={{ flex: 1, pr: 1 }}>
                {editingTitle ? (
                  <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => { saveField('title', titleDraft); setEditingTitle(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { saveField('title', titleDraft); setEditingTitle(false); } if (e.key === 'Escape') setEditingTitle(false); }}
                    sx={{ '& input': { fontWeight: 700, fontSize: '1.1rem' } }}
                  />
                ) : (
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ cursor: 'pointer', lineHeight: 1.3, '&:hover': { color: 'primary.main' } }}
                    onClick={() => { setTitleDraft(detail.title); setEditingTitle(true); }}
                  >
                    {detail.title}
                  </Typography>
                )}
                <Box display="flex" gap={0.75} mt={0.75} flexWrap="wrap" alignItems="center">
                  <Chip
                    label={detail.type}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f1f5f9', color: 'text.secondary', border: 0 }}
                  />
                  {detail.parent && (
                    <Chip
                      label={`↑ ${detail.parent.title}`}
                      size="small"
                      sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f1f5f9', color: 'text.secondary', border: 0 }}
                    />
                  )}
                </Box>
              </Box>
              <IconButton size="small" onClick={onClose} sx={{ mt: -0.25, mr: -0.5 }}>
                <Close fontSize="small" />
              </IconButton>
            </Box>

            {/* Quick status + priority pills */}
            <Box display="flex" gap={1} pb={1.5} flexWrap="wrap">
              <FormControl size="small">
                <Select
                  value={detail.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  sx={{
                    height: 26, fontSize: '0.72rem',
                    bgcolor: STATUS_CONFIG[detail.status]?.bg,
                    color: STATUS_CONFIG[detail.status]?.color,
                    fontWeight: 600,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                  }}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <Select
                  value={detail.priority}
                  onChange={e => handlePriorityChange(e.target.value)}
                  sx={{
                    height: 26, fontSize: '0.72rem',
                    bgcolor: PRIORITY_CONFIG[detail.priority]?.bg,
                    color: PRIORITY_CONFIG[detail.priority]?.color,
                    fontWeight: 600,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                  }}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem', color: c.color, fontWeight: 600 }}>
                      {v.charAt(0) + v.slice(1).toLowerCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36, mb: -0.5 }}>
              <Tab icon={<Info sx={{ fontSize: 15 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<LinkIcon sx={{ fontSize: 15 }} />} iconPosition="start" label={`Links${links.length ? ` (${links.length})` : ''}`} sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<Comment sx={{ fontSize: 15 }} />} iconPosition="start" label={`Notes${comments.length ? ` (${comments.length})` : ''}`} sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<History sx={{ fontSize: 15 }} />} iconPosition="start" label="Activity" sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
            </Tabs>
          </Box>

          {/* Tab bodies */}
          <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ── OVERVIEW ── */}
            <TabPanel value={tab} idx={0}>
              <Box sx={{ px: 3, py: 2.5 }}>

                {/* Description */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                  DESCRIPTION
                </Typography>
                {editingDesc ? (
                  <TextField
                    autoFocus
                    fullWidth
                    multiline
                    rows={4}
                    size="small"
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    onBlur={() => { saveField('description', descDraft); setEditingDesc(false); }}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
                    sx={{ mb: 2 }}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    color={detail.description ? 'text.primary' : 'text.disabled'}
                    sx={{ mb: 2, cursor: 'pointer', '&:hover': { color: 'primary.main' }, whiteSpace: 'pre-wrap' }}
                    onClick={() => { setDescDraft(detail.description || ''); setEditingDesc(true); }}
                  >
                    {detail.description || 'Click to add description…'}
                  </Typography>
                )}

                {/* Progress */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  PROGRESS — {detail.progress ?? 0}%
                </Typography>
                <Slider
                  value={detail.progress ?? 0}
                  min={0} max={100} step={5}
                  onChange={(_, v) => setFullData(prev => ({ ...prev, progress: v }))}
                  onChangeCommitted={(_, v) => saveField('progress', v)}
                  sx={{ mb: 2.5, color: 'primary.main' }}
                  size="small"
                />

                {/* Dates */}
                <Box display="flex" gap={2} mb={2.5} flexWrap="wrap">
                  <Box flex={1} minWidth={120}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                      START DATE
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      fullWidth
                      value={detail.startDate ? detail.startDate.slice(0, 10) : ''}
                      onChange={e => saveField('startDate', e.target.value || null)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box flex={1} minWidth={120}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}
                      sx={{ color: detail.dueDate && new Date(detail.dueDate) < new Date() && detail.status !== 'COMPLETED' ? 'error.main' : undefined }}
                    >
                      DUE DATE
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      fullWidth
                      value={detail.dueDate ? detail.dueDate.slice(0, 10) : ''}
                      onChange={e => saveField('dueDate', e.target.value || null)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ style: { color: detail.dueDate && new Date(detail.dueDate) < new Date() && detail.status !== 'COMPLETED' ? '#dc2626' : undefined } }}
                    />
                  </Box>
                </Box>

                {/* Tags */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                  TAGS
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                  {(detail.tags || []).map(tag => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      onDelete={() => removeTag(tag)}
                      sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', border: 0, fontWeight: 500, fontSize: '0.7rem' }}
                    />
                  ))}
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={allTags}
                    filterOptions={(opts, { inputValue }) =>
                      inputValue.length >= 3
                        ? opts.filter(o => !(detail.tags || []).includes(o) && o.toLowerCase().includes(inputValue.toLowerCase()))
                        : []
                    }
                    inputValue={tagInput}
                    onInputChange={(_, val, reason) => { if (reason === 'input') setTagInput(val); }}
                    onChange={(_, val) => { if (val) addTag(typeof val === 'string' ? val : ''); }}
                    sx={{ width: 130 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Add tag…"
                        onKeyDown={e => {
                          if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
                        }}
                        onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                        sx={{ '& .MuiInputBase-input': { py: 0.25, px: 0.75, fontSize: '0.72rem' } }}
                        InputProps={{ ...params.InputProps, sx: { height: 24 } }}
                      />
                    )}
                  />
                </Box>

                {/* Canvas */}
                {canvases.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                      CANVAS
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={detail.canvasId || ''}
                        displayEmpty
                        onChange={e => saveField('canvasId', e.target.value || null)}
                        sx={{ fontSize: '0.8rem' }}
                      >
                        <MenuItem value="" sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>— No canvas —</MenuItem>
                        {canvases.map(c => (
                          <MenuItem key={c.id} value={c.id} sx={{ fontSize: '0.8rem' }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                              {c.name}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}

                {/* Assignees */}
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                    ASSIGNEES
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75} mb={1}>
                    {(detail.assignees || []).map(a => (
                      <Box key={a.id} display="flex" alignItems="center" gap={0.6}
                        sx={{ bgcolor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 5, pl: 0.75, pr: 0.5, py: 0.25 }}
                      >
                        <Avatar sx={{ width: 18, height: 18, fontSize: '0.6rem', bgcolor: '#6366f1' }}>
                          {a.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="caption" fontWeight={500} sx={{ color: '#0369a1' }}>{a.name}</Typography>
                        <IconButton
                          size="small"
                          sx={{ p: 0.1, ml: 0.1, color: '#94a3b8', '&:hover': { color: 'error.main' } }}
                          onClick={() => {
                            const newIds = (detail.assignees || []).filter(x => x.id !== a.id).map(x => x.id);
                            saveField('assigneeIds', newIds);
                            setFullData(prev => prev ? { ...prev, assignees: prev.assignees.filter(x => x.id !== a.id) } : prev);
                          }}
                        >
                          <Close sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                  <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value=""
                        onChange={e => {
                          const uid = e.target.value;
                          if (!uid) return;
                          if (uid === '__create__') { setQuickUserOpen(true); return; }
                          const newUser = users.find(u => u.id === uid);
                          const newAssignees = [...(detail.assignees || []), newUser];
                          saveField('assigneeIds', newAssignees.map(a => a.id));
                          setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
                        }}
                        sx={{ fontSize: '0.8rem' }}
                        renderValue={() => <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>+ Add assignee…</Typography>}
                      >
                        {users
                          .filter(u => !(detail.assignees || []).find(a => a.id === u.id))
                          .map(u => (
                            <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.8rem' }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Avatar sx={{ width: 22, height: 22, fontSize: '0.62rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>{u.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                                </Box>
                              </Box>
                            </MenuItem>
                          ))}
                        <Divider />
                        <MenuItem value="__create__" sx={{ fontSize: '0.8rem', color: '#6366f1', gap: 1 }}>
                          <PersonAdd sx={{ fontSize: 15 }} />
                          <Typography variant="body2" fontWeight={500} color="#6366f1">New person…</Typography>
                        </MenuItem>
                      </Select>
                    </FormControl>

                </>

                {/* Created by */}
                {detail.createdBy && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption" color="text.disabled">
                        Created by {detail.createdBy.name}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {format(new Date(detail.createdAt), 'MMM d, yyyy')}
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>
            </TabPanel>

            {/* ── LINKS ── */}
            <TabPanel value={tab} idx={1}>
              <Box sx={{ px: 3, py: 2.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() => setShowLinkForm(v => !v)}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  Add Link
                </Button>

                {showLinkForm && (
                  <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', mb: 2 }}>
                    <TextField
                      fullWidth size="small" label="URL *" value={linkForm.url}
                      onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Title" value={linkForm.title}
                      onChange={e => setLinkForm(f => ({ ...f, title: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Description" value={linkForm.description}
                      onChange={e => setLinkForm(f => ({ ...f, description: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Category" value={linkForm.category}
                      onChange={e => setLinkForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Documentation, Reference"
                      sx={{ mb: 1.5 }}
                    />
                    <Box display="flex" justifyContent="flex-end" gap={1}>
                      <Button size="small" onClick={() => setShowLinkForm(false)} variant="outlined">Cancel</Button>
                      <Button size="small" variant="contained" onClick={handleAddLink} disabled={addingLink || !linkForm.url.trim()}>
                        {addingLink ? <CircularProgress size={14} /> : 'Save'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {links.length === 0 ? (
                  <Box textAlign="center" py={4}>
                    <LinkIcon sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                    <Typography variant="body2" color="text.disabled">No links yet</Typography>
                  </Box>
                ) : (
                  links.map(link => (
                    <Box
                      key={link.id}
                      sx={{
                        p: 1.75, mb: 1.25, borderRadius: 2, border: '1px solid #e2e8f0',
                        '&:hover': { borderColor: '#6366f1', boxShadow: '0 2px 8px rgba(99,102,241,0.08)' },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box flex={1} minWidth={0} mr={1}>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              component="a"
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: '#6366f1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}
                            >
                              {link.title || link.url}
                            </Typography>
                            <OpenInNew sx={{ fontSize: 12, color: '#6366f1', flexShrink: 0 }} />
                          </Box>
                          {link.title && (
                            <Typography variant="caption" color="text.disabled" noWrap display="block">{link.url}</Typography>
                          )}
                          {link.description && (
                            <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>{link.description}</Typography>
                          )}
                          {link.category && (
                            <Chip label={link.category} size="small" sx={{ height: 16, fontSize: '0.6rem', mt: 0.5, bgcolor: '#f1f5f9', color: 'text.secondary', border: 0 }} />
                          )}
                        </Box>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDeleteLink(link.id)} sx={{ color: 'error.main', flexShrink: 0 }}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </TabPanel>

            {/* ── COMMENTS ── */}
            <TabPanel value={tab} idx={2}>
              <Box sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Comment list */}
                <Box flex={1} mb={2}>
                  {comments.length === 0 ? (
                    <Box textAlign="center" py={4}>
                      <Comment sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                      <Typography variant="body2" color="text.disabled">No notes yet</Typography>
                    </Box>
                  ) : (
                    comments.map(c => (
                      <Box key={c.id} display="flex" gap={1.5} mb={2}>
                        <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', bgcolor: '#6366f1', flexShrink: 0 }}>
                          {c.user?.name?.charAt(0) || '?'}
                        </Avatar>
                        <Box flex={1} minWidth={0}>
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" fontWeight={600}>{c.user?.name}</Typography>
                            <Typography variant="caption" color="text.disabled">
                              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                            </Typography>
                          </Box>
                          {editingCommentId === c.id ? (
                            <Box mt={0.5}>
                              <TextField
                                autoFocus fullWidth multiline size="small" value={editingCommentText}
                                onChange={e => setEditingCommentText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') setEditingCommentId(null); }}
                                sx={{ mb: 0.75 }}
                              />
                              <Box display="flex" gap={0.75}>
                                <Button size="small" variant="contained" onClick={() => handleEditComment(c.id)}>Save</Button>
                                <Button size="small" variant="outlined" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                              </Box>
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                mt: 0.25, p: 1.25, bgcolor: '#f8fafc', borderRadius: 2,
                                border: '1px solid #f1f5f9', position: 'relative',
                                '&:hover .comment-actions': { opacity: 1 },
                              }}
                            >
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
                              {c.user?.id === user?.id && (
                                <Box className="comment-actions" sx={{ opacity: 0, transition: 'opacity 0.15s', position: 'absolute', top: 4, right: 4, display: 'flex', gap: 0.25 }}>
                                  <IconButton size="small" sx={{ p: 0.25 }} onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}>
                                    <Edit sx={{ fontSize: 13 }} />
                                  </IconButton>
                                  <IconButton size="small" sx={{ p: 0.25, color: 'error.main' }} onClick={() => handleDeleteComment(c.id)}>
                                    <Delete sx={{ fontSize: 13 }} />
                                  </IconButton>
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>

                {/* New comment input */}
                <Box sx={{ borderTop: '1px solid #f1f5f9', pt: 2 }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={5}
                    size="small"
                    placeholder="Add a note or comment…"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendComment(); }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 0.25 }}>
                          <Tooltip title="Send (Ctrl+Enter)">
                            <span>
                              <IconButton size="small" onClick={handleSendComment} disabled={sendingComment || !commentText.trim()} color="primary">
                                {sendingComment ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      )
                    }}
                  />
                </Box>
              </Box>
            </TabPanel>

            {/* ── ACTIVITY ── */}
            <TabPanel value={tab} idx={3}>
              <Box sx={{ px: 3, py: 2.5 }}>
                {activity.length === 0 ? (
                  <Box textAlign="center" py={4}>
                    <History sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                    <Typography variant="body2" color="text.disabled">No activity yet</Typography>
                  </Box>
                ) : (
                  activity.map((log, idx) => (
                    <Box key={log.id} display="flex" gap={1.5} mb={2} sx={{ position: 'relative' }}>
                      {/* Timeline line */}
                      {idx < activity.length - 1 && (
                        <Box sx={{ position: 'absolute', left: 13, top: 28, bottom: -16, width: 1.5, bgcolor: '#e2e8f0' }} />
                      )}
                      <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', bgcolor: '#f1f5f9', color: '#64748b', flexShrink: 0, zIndex: 1 }}>
                        {log.user?.name?.charAt(0) || '?'}
                      </Avatar>
                      <Box flex={1} minWidth={0}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                          <Typography variant="caption" color="text.secondary">
                            <b>{log.user?.name}</b> {ACTION_LABELS[log.action] || log.action}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, ml: 1 }}>
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </Typography>
                        </Box>
                        {log.changes && log.action === 'status_changed' && (
                          <Typography variant="caption" color="text.disabled" display="block">
                            → {STATUS_CONFIG[log.changes.status]?.label || log.changes.status}
                          </Typography>
                        )}
                        {log.changes && log.action === 'priority_changed' && (
                          <Typography variant="caption" color="text.disabled" display="block">
                            → {log.changes.priority}
                          </Typography>
                        )}
                        {log.changes && log.action === 'link_added' && (
                          <Typography variant="caption" color="text.disabled" display="block" noWrap>
                            {log.changes.title || log.changes.url}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </TabPanel>

          </Box>
        </>
      )}
    </Drawer>

    {/* Quick create user dialog */}
    <Dialog open={quickUserOpen} onClose={() => setQuickUserOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>New Assignee</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <TextField
          label="Name *"
          size="small"
          fullWidth
          autoFocus
          value={quickUserName}
          onChange={e => setQuickUserName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleQuickCreateUser(newUser => {
            const newAssignees = [...(fullData?.assignees || []), newUser];
            saveField('assigneeIds', newAssignees.map(a => a.id));
            setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
          })}
        />
        <FormControl size="small" fullWidth>
          <InputLabel>Role</InputLabel>
          <Select label="Role" value={quickUserRole} onChange={e => setQuickUserRole(e.target.value)}>
            <MenuItem value="ADMIN">Admin</MenuItem>
            <MenuItem value="MANAGER">Manager</MenuItem>
            <MenuItem value="VIEWER">Viewer</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={() => setQuickUserOpen(false)}>Cancel</Button>
        <Button
          size="small" variant="contained" disabled={!quickUserName.trim() || quickUserSaving}
          onClick={() => handleQuickCreateUser(newUser => {
            const newAssignees = [...(fullData?.assignees || []), newUser];
            saveField('assigneeIds', newAssignees.map(a => a.id));
            setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
          })}
        >
          {quickUserSaving ? 'Creating…' : 'Create & Add'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
