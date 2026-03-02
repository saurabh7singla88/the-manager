import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, TextField, Checkbox, IconButton, Chip,
  CircularProgress, Divider, Tooltip, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem as MuiMenuItem, ListItemIcon,
  Avatar, AvatarGroup,
  Autocomplete
} from '@mui/material';
import {
  Add, Search, Clear, Edit, Delete, Label,
  MoreVert, OpenInNew, CheckBox as CheckBoxIcon, CalendarToday
} from '@mui/icons-material';
import { fetchTasks, createInitiative, updateInitiative, deleteInitiative } from '../features/initiatives/initiativesSlice';
import CanvasSelector from '../components/CanvasSelector';
import InitiativeDetailDrawer from '../components/InitiativeDetailDrawer';
import api from '../api/axios';
import { format } from 'date-fns';

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2' },
  HIGH:     { color: '#d97706', bg: '#fffbeb' },
  MEDIUM:   { color: '#6366f1', bg: '#eff6ff' },
  LOW:      { color: '#64748b', bg: '#f1f5f9' },
};

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  canvasId: null,
  linkedInitiativeId: null,
  dueDate: '',
  tags: [],
  assigneeIds: [],
};

export default function Tasks() {
  const dispatch = useDispatch();
  const { tasks, tasksLoading } = useSelector(s => s.initiatives);
  const { activeCanvasId, canvases } = useSelector(s => s.canvas);

  // Search / filter
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending'); // 'all' | 'pending' | 'completed'
  const searchTimer = useRef(null);

  // Quick-add
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAdding, setQuickAdding] = useState(false);

  // Full create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [initiatives, setInitiatives] = useState([]); // for linkedInitiative picker
  const [users, setUsers] = useState([]);

  const allTags = useMemo(
    () => [...new Set((tasks || []).flatMap(t => t.tags || []))].sort(),
    [tasks]
  );

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState(null);

  // Row context menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTask, setMenuTask] = useState(null);

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  // ── Fetch ───────────────────────────────────────────────
  const doFetch = useCallback((s, status, canvasId) => {
    const filters = { ...(s && { search: s }), ...(canvasId && { canvasId }) };
    if (status === 'completed') filters.status = 'COMPLETED';
    dispatch(fetchTasks(filters));
  }, [dispatch]);

  useEffect(() => {
    doFetch(search, filterStatus, activeCanvasId);
  }, [filterStatus, activeCanvasId]); // eslint-disable-line

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doFetch(search, filterStatus, activeCanvasId), 300);
  }, [search]); // eslint-disable-line

  // Fetch initiatives for the linked-initiative picker
  useEffect(() => {
    api.get('/initiatives?parentId=null').then(r => {
      setInitiatives(r.data.filter(i => i.type === 'INITIATIVE'));
    }).catch(() => {});
    api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const handleQuickCreateUser = async (onCreated) => {
    if (!quickUserName.trim()) return;
    setQuickUserSaving(true);
    try {
      const r = await api.post('/users', { name: quickUserName.trim(), role: quickUserRole });
      setUsers(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      onCreated(r.data.id);
      setQuickUserOpen(false);
      setQuickUserName('');
      setQuickUserRole('VIEWER');
    } catch (err) {
      console.error('Failed to create user', err);
    } finally {
      setQuickUserSaving(false);
    }
  };

  // ── Client-side filter for "pending" (everything that is NOT completed) ──
  const displayTasks = filterStatus === 'pending'
    ? tasks.filter(t => t.status !== 'COMPLETED')
    : filterStatus === 'completed'
    ? tasks.filter(t => t.status === 'COMPLETED')
    : tasks;

  // ── Quick add ───────────────────────────────────────────
  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return;
    setQuickAdding(true);
    try {
      await dispatch(createInitiative({
        title: quickTitle.trim(),
        type: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
        isStandaloneTask: true,
        ...(activeCanvasId && { canvasId: activeCanvasId }),
      }));
      setQuickTitle('');
      doFetch(search, filterStatus, activeCanvasId);
    } finally {
      setQuickAdding(false);
    }
  };

  // ── Checkbox toggle ─────────────────────────────────────
  const handleToggleComplete = async (task) => {
    const newStatus = task.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
    await dispatch(updateInitiative({ id: task.id, data: { status: newStatus } }));
    doFetch(search, filterStatus, activeCanvasId);
  };

  // ── Delete ──────────────────────────────────────────────
  const handleDelete = async (id) => {
    setMenuAnchor(null);
    if (window.confirm('Delete this task?')) {
      await dispatch(deleteInitiative(id));
      doFetch(search, filterStatus, activeCanvasId);
    }
  };

  // ── Full create/edit dialog ─────────────────────────────
  const openCreate = () => {
    setEditingTask(null);
    setFormData({ ...EMPTY_FORM, canvasId: activeCanvasId || null });
    setTagInput('');
    setDialogOpen(true);
  };

  const openEdit = (task) => {
    setMenuAnchor(null);
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      canvasId: task.canvasId || null,
      linkedInitiativeId: task.linkedInitiativeId || null,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      tags: task.tags || [],
      assigneeIds: task.assignees?.map(a => a.id) || [],
    });
    setTagInput('');
    setDialogOpen(true);
  };

  const handleDialogSave = async () => {
    const payload = {
      ...formData,
      type: 'TASK',
      isStandaloneTask: true,
      dueDate: formData.dueDate || null,
      linkedInitiativeId: formData.linkedInitiativeId || null,
      canvasId: formData.canvasId || null,
    };
    if (editingTask) {
      await dispatch(updateInitiative({ id: editingTask.id, data: payload }));
    } else {
      await dispatch(createInitiative({ ...payload, status: 'OPEN' }));
    }
    setDialogOpen(false);
    doFetch(search, filterStatus, activeCanvasId);
  };

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t || formData.tags.includes(t)) return;
    setFormData(p => ({ ...p, tags: [...p.tags, t] }));
    setTagInput('');
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <Box>
      <CanvasSelector />

      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Tasks</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {displayTasks.length} task{displayTasks.length !== 1 ? 's' : ''}
            {activeCanvasId ? ` in ${canvases.find(c => c.id === activeCanvasId)?.name}` : ''}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Task</Button>
      </Box>

      {/* Quick-add bar */}
      <Box
        display="flex" gap={1.5} mb={3}
        sx={{ bgcolor: 'background.paper', border: '1px solid #e2e8f0', borderRadius: 3, p: 1.5 }}
      >
        <CheckBoxIcon sx={{ color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
        <TextField
          fullWidth
          size="small"
          variant="standard"
          placeholder="Quick add a task… (press Enter)"
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
          InputProps={{ disableUnderline: true, sx: { fontSize: '0.95rem' } }}
        />
        {quickTitle && (
          <IconButton size="small" onClick={handleQuickAdd} disabled={quickAdding}>
            {quickAdding ? <CircularProgress size={16} /> : <Add />}
          </IconButton>
        )}
      </Box>

      {/* Search + filters */}
      <Box display="flex" gap={1.5} mb={3} flexWrap="wrap" alignItems="center">
        <TextField
          size="small"
          placeholder="Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch('')}><Clear sx={{ fontSize: 14 }} /></IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Show</InputLabel>
          <Select value={filterStatus} label="Show" onChange={e => setFilterStatus(e.target.value)}>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="all">All tasks</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Task list */}
      {tasksLoading && !tasks.length ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : displayTasks.length === 0 ? (
        <Box display="flex" flexDirection="column" alignItems="center" py={8} gap={1}>
          <CheckBoxIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography color="text.secondary">No tasks yet. Quick-add one above!</Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: 'background.paper', border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
          {displayTasks.map((task, idx) => {
            const done = task.status === 'COMPLETED';
            const overdue = task.dueDate && new Date(task.dueDate) < new Date() && !done;
            const linkedInit = task.linkedInitiative;
            const canvas = canvases.find(c => c.id === task.canvasId);

            return (
              <Box key={task.id}>
                {idx > 0 && <Divider />}
                <Box
                  display="flex" alignItems="center" gap={1.5} px={2} py={1.25}
                  sx={{ '&:hover': { bgcolor: '#f8fafc' }, transition: 'background 0.1s' }}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={done}
                    onChange={() => handleToggleComplete(task)}
                    size="small"
                    sx={{
                      p: 0.5, flexShrink: 0,
                      color: done ? '#22c55e' : '#cbd5e1',
                      '&.Mui-checked': { color: '#22c55e' },
                    }}
                  />

                  {/* Title */}
                  <Box
                    sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => { setDrawerTaskId(task.id); setDrawerOpen(true); }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      sx={{
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'text.disabled' : 'text.primary',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {task.title}
                    </Typography>
                    <Box display="flex" gap={0.5} mt={0.4} flexWrap="wrap" alignItems="center">
                      {linkedInit && (
                        <Chip
                          label={`↗ ${linkedInit.title}`}
                          size="small"
                          sx={{ height: 16, fontSize: '0.65rem', bgcolor: '#f0fdf4', color: '#065f46', border: 0, fontWeight: 500 }}
                        />
                      )}
                      {(task.tags || []).map(tag => (
                        <Chip key={tag} label={`#${tag}`} size="small"
                          sx={{ height: 16, fontSize: '0.65rem', bgcolor: '#eff6ff', color: '#1d4ed8', border: 0 }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Meta */}
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    {task.dueDate && (
                      <Tooltip title={`Due ${format(new Date(task.dueDate), 'MMM d, yyyy')}`}>
                        <Box display="flex" alignItems="center" gap={0.4}>
                          <CalendarToday sx={{ fontSize: 12, color: overdue ? '#dc2626' : 'text.disabled' }} />
                          <Typography variant="caption" sx={{ color: overdue ? '#dc2626' : 'text.disabled', fontSize: '0.7rem' }}>
                            {format(new Date(task.dueDate), 'MMM d')}
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
                    <Chip
                      label={task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                      size="small"
                      sx={{
                        height: 18, fontSize: '0.65rem', fontWeight: 600,
                        bgcolor: PRIORITY_CONFIG[task.priority]?.bg,
                        color: PRIORITY_CONFIG[task.priority]?.color,
                        border: 0,
                      }}
                    />
                    {task.assignees?.length > 0 && (
                      <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: '0.55rem', border: '2px solid white' } }}>
                        {task.assignees.map(a => (
                          <Tooltip key={a.id} title={a.name}>
                            <Avatar sx={{ width: 20, height: 20, fontSize: '0.55rem', bgcolor: '#6366f1' }}>
                              {a.name.charAt(0).toUpperCase()}
                            </Avatar>
                          </Tooltip>
                        ))}
                      </AvatarGroup>
                    )}
                    {canvas && (
                      <Box
                        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: canvas.color, flexShrink: 0 }}
                        title={canvas.name}
                      />
                    )}
                    <Tooltip title="More">
                      <IconButton
                        size="small" sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'text.primary' } }}
                        onClick={(e) => { setMenuTask(task); setMenuAnchor(e.currentTarget); }}
                      >
                        <MoreVert sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Row context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { minWidth: 150, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
      >
        <MuiMenuItem dense onClick={() => { setDrawerTaskId(menuTask?.id); setDrawerOpen(true); setMenuAnchor(null); }}>
          <ListItemIcon><OpenInNew sx={{ fontSize: 15 }} /></ListItemIcon> Open details
        </MuiMenuItem>
        <MuiMenuItem dense onClick={() => openEdit(menuTask)}>
          <ListItemIcon><Edit sx={{ fontSize: 15 }} /></ListItemIcon> Edit
        </MuiMenuItem>
        <Divider />
        <MuiMenuItem dense onClick={() => handleDelete(menuTask?.id)} sx={{ color: 'error.main' }}>
          <ListItemIcon><Delete sx={{ fontSize: 15, color: 'error.main' }} /></ListItemIcon> Delete
        </MuiMenuItem>
      </Menu>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle>
        <Divider />
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              autoFocus fullWidth size="small" label="Title"
              value={formData.title}
              onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleDialogSave(); }}
            />
            <TextField
              fullWidth size="small" multiline rows={2} label="Description (optional)"
              value={formData.description}
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
            />
            <Box display="flex" gap={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select value={formData.priority} label="Priority"
                  onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                >
                  <MenuItem value="CRITICAL">Critical</MenuItem>
                  <MenuItem value="HIGH">High</MenuItem>
                  <MenuItem value="MEDIUM">Medium</MenuItem>
                  <MenuItem value="LOW">Low</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth size="small" type="date" label="Due date"
                InputLabelProps={{ shrink: true }}
                value={formData.dueDate}
                onChange={e => setFormData(p => ({ ...p, dueDate: e.target.value }))}
              />
            </Box>
            {initiatives.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Linked Initiative (optional)</InputLabel>
                <Select
                  value={formData.linkedInitiativeId || ''}
                  label="Linked Initiative (optional)"
                  onChange={e => setFormData(p => ({ ...p, linkedInitiativeId: e.target.value || null }))}
                >
                  <MenuItem value="">— None —</MenuItem>
                  {initiatives.map(i => (
                    <MenuItem key={i.id} value={i.id}>{i.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {canvases.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Canvas (optional)</InputLabel>
                <Select
                  value={formData.canvasId || ''}
                  label="Canvas (optional)"
                  onChange={e => setFormData(p => ({ ...p, canvasId: e.target.value || null }))}
                >
                  <MenuItem value="">— None —</MenuItem>
                  {canvases.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color }} />
                        {c.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {users.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Assignees</InputLabel>
                <Select
                  multiple
                  value={formData.assigneeIds || []}
                  label="Assignees"
                  onChange={e => {
                    const v = e.target.value;
                    if (Array.isArray(v) && v.includes('__create__')) {
                      setQuickUserOpen(true);
                      return;
                    }
                    setFormData(p => ({ ...p, assigneeIds: v }));
                  }}
                  renderValue={(selected) => (
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {selected.map(id => {
                        const u = users.find(u => u.id === id);
                        return u ? (
                          <Box key={id} display="flex" alignItems="center" gap={0.4}
                            sx={{ bgcolor: '#eff6ff', borderRadius: 4, px: 0.75, py: 0.25 }}>
                            <Avatar sx={{ width: 16, height: 16, fontSize: '0.55rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                            <Typography sx={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500 }}>{u.name}</Typography>
                          </Box>
                        ) : null;
                      })}
                    </Box>
                  )}
                >
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{u.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value="__create__" sx={{ color: '#6366f1', gap: 1 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" fontWeight={500} color="#6366f1">+ New person…</Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            )}
            {/* Tags */}
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>TAGS</Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={0.5}>
                {formData.tags.map(tag => (
                  <Chip key={tag} label={tag} size="small"
                    onDelete={() => setFormData(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}
                    sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', border: 0, fontSize: '0.72rem' }}
                  />
                ))}
              </Box>
              <Autocomplete
                freeSolo
                disableClearable
                options={allTags}
                filterOptions={(opts, { inputValue }) =>
                  inputValue.length >= 3
                    ? opts.filter(o => !formData.tags.includes(o) && o.toLowerCase().includes(inputValue.toLowerCase()))
                    : []
                }
                inputValue={tagInput}
                onInputChange={(_, val, reason) => { if (reason === 'input') setTagInput(val); }}
                onChange={(_, val) => { if (val) addTag(typeof val === 'string' ? val : ''); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small" fullWidth placeholder="Type tag and press Enter…"
                    onKeyDown={e => {
                      if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
                    }}
                    onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: <InputAdornment position="start"><Label sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>
                    }}
                  />
                )}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleDialogSave} disabled={!formData.title.trim()}>
            {editingTask ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail drawer */}
      <InitiativeDetailDrawer
        initiativeId={drawerTaskId}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); doFetch(search, filterStatus, activeCanvasId); }}
      />

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
            onKeyDown={e => e.key === 'Enter' && handleQuickCreateUser(id => setFormData(f => ({ ...f, assigneeIds: [...(f.assigneeIds || []), id] })))}
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
            onClick={() => handleQuickCreateUser(id => setFormData(f => ({ ...f, assigneeIds: [...(f.assigneeIds || []), id] })))}
          >
            {quickUserSaving ? 'Creating…' : 'Create & Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
