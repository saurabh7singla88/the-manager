import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  Box, Typography, Button, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Grid, CircularProgress, Divider, Tooltip
} from '@mui/material';
import { Add, Edit, Delete, ExpandMore, ExpandLess, AccountTree, AddCircleOutline } from '@mui/icons-material';
import {
  fetchInitiatives, createInitiative, updateInitiative,
  deleteInitiative, updateStatus, updatePriority, fetchInitiativeById
} from '../features/initiatives/initiativesSlice';
import { format } from 'date-fns';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: '#f0fdf4' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f9fafb' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
  HIGH:     { color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  MEDIUM:   { color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  LOW:      { color: '#64748b', bg: '#f1f5f9', border: '#64748b' },
};

const TYPE_LABELS = { INITIATIVE: 'Initiative', TASK: 'Task', SUBTASK: 'Subtask' };

export default function InitiativesList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, loading, selectedInitiative } = useSelector((state) => state.initiatives);
  const [openDialog, setOpenDialog] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'INITIATIVE',
    status: 'OPEN',
    priority: 'MEDIUM',
    parentId: null
  });
  const [editingId, setEditingId] = useState(null);
  const [childrenMap, setChildrenMap] = useState({}); // { [parentId]: initiative[] }
  const [loadingChildren, setLoadingChildren] = useState({});

  useEffect(() => {
    dispatch(fetchInitiatives({ parentId: 'null' }));
  }, [dispatch]);

  const handleOpenDialog = (parentId = null, initiative = null) => {
    if (initiative) {
      setFormData({
        title: initiative.title,
        description: initiative.description || '',
        type: initiative.type,
        status: initiative.status,
        priority: initiative.priority,
        parentId: initiative.parentId
      });
      setEditingId(initiative.id);
    } else {
      setFormData({
        title: '',
        description: '',
        type: parentId ? 'TASK' : 'INITIATIVE',
        status: 'OPEN',
        priority: 'MEDIUM',
        parentId
      });
      setEditingId(null);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setFormData({
      title: '',
      description: '',
      type: 'INITIATIVE',
      status: 'OPEN',
      priority: 'MEDIUM',
      parentId: null
    });
    setEditingId(null);
  };

  const fetchChildren = useCallback(async (id) => {
    setLoadingChildren(prev => ({ ...prev, [id]: true }));
    try {
      const response = await api.get(`/initiatives?parentId=${id}`);
      setChildrenMap(prev => ({ ...prev, [id]: response.data }));
    } catch (e) {
      console.error('Failed to fetch children', e);
    } finally {
      setLoadingChildren(prev => ({ ...prev, [id]: false }));
    }
  }, []);

  const handleSubmit = async () => {
    const parentId = formData.parentId; // capture before dialog closes and resets formData
    if (editingId) {
      await dispatch(updateInitiative({ id: editingId, data: formData }));
    } else {
      await dispatch(createInitiative(formData));
    }
    handleCloseDialog();
    // Refresh root list (updates _count on parent items)
    dispatch(fetchInitiatives({ parentId: 'null' }));
    // If it was a child, also refresh that parent's children in the map
    if (parentId) {
      fetchChildren(parentId);
      // Auto-expand the parent
      setExpanded(prev => ({ ...prev, [parentId]: true }));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this initiative and all its children?')) {
      await dispatch(deleteInitiative(id));
      dispatch(fetchInitiatives({ parentId: 'null' }));
    }
  };

  const handleStatusChange = async (id, status) => {
    await dispatch(updateStatus({ id, status }));
  };

  const handlePriorityChange = async (id, priority) => {
    await dispatch(updatePriority({ id, priority }));
  };

  const handleViewDetails = async (id) => {
    await dispatch(fetchInitiativeById(id));
    setDetailsDialog(true);
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const nowExpanded = !prev[id];
      if (nowExpanded) fetchChildren(id);
      return { ...prev, [id]: nowExpanded };
    });
  };

  const renderInitiative = (initiative, level = 0) => {
    const sc = STATUS_CONFIG[initiative.status] || STATUS_CONFIG.OPEN;
    const pc = PRIORITY_CONFIG[initiative.priority] || PRIORITY_CONFIG.MEDIUM;
    const hasChildren = initiative._count?.children > 0;
    const isExpanded = expanded[initiative.id];
    return (
      <Box key={initiative.id}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            ml: level * 3,
            bgcolor: 'background.paper',
            border: '1px solid #e2e8f0',
            borderLeft: `3px solid ${pc.border}`,
            borderRadius: 2,
            mb: 1,
            transition: 'box-shadow 0.15s',
            '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' },
          }}
        >
          {/* Expand toggle */}
          <Box sx={{ width: 28, flexShrink: 0 }}>
            {hasChildren ? (
              <IconButton size="small" onClick={() => toggleExpand(initiative.id)} sx={{ p: 0.25 }}>
                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            ) : null}
          </Box>

          {/* Title + meta */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                {initiative.title}
              </Typography>
              <Chip
                label={TYPE_LABELS[initiative.type] || initiative.type}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.65rem', px: 0.5, color: 'text.secondary', borderColor: '#e2e8f0' }}
              />
            </Box>
            {initiative.description && (
              <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mt: 0.25 }}>
                {initiative.description}
              </Typography>
            )}
            <Box display="flex" gap={0.75} mt={0.75} flexWrap="wrap" alignItems="center">
              <FormControl size="small">
                <Select
                  value={initiative.status}
                  onChange={(e) => handleStatusChange(initiative.id, e.target.value)}
                  sx={{
                    fontSize: '0.72rem', height: 24, bgcolor: sc.bg, color: sc.color,
                    fontWeight: 500, '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '.MuiSelect-icon': { color: sc.color, right: 2 },
                    pr: 0.5,
                  }}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <Select
                  value={initiative.priority}
                  onChange={(e) => handlePriorityChange(initiative.id, e.target.value)}
                  sx={{
                    fontSize: '0.72rem', height: 24, bgcolor: pc.bg, color: pc.color,
                    fontWeight: 500, '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '.MuiSelect-icon': { color: pc.color, right: 2 },
                    pr: 0.5,
                  }}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem', color: c.color }}>{v.charAt(0) + v.slice(1).toLowerCase()}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {hasChildren && (
                <Typography variant="caption" color="text.disabled">
                  {initiative._count.children} sub-item{initiative._count.children !== 1 ? 's' : ''}
                </Typography>
              )}
              {initiative.createdBy && (
                <Typography variant="caption" color="text.disabled">
                  · {format(new Date(initiative.createdAt), 'MMM d')}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Actions */}
          <Box display="flex" gap={0.25} flexShrink={0}>
            <Tooltip title="Add sub-item">
              <IconButton size="small" onClick={() => handleOpenDialog(initiative.id)} sx={{ color: 'primary.main' }}>
                <AddCircleOutline sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => handleOpenDialog(null, initiative)} sx={{ color: 'text.secondary' }}>
                <Edit sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => handleDelete(initiative.id)} sx={{ color: 'error.main' }}>
                <Delete sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Children */}
        {isExpanded && (
          loadingChildren[initiative.id]
            ? <Box sx={{ ml: (level + 1) * 3 + 2, mb: 1, py: 1 }}><CircularProgress size={18} /></Box>
            : (childrenMap[initiative.id] || []).map(child => renderInitiative(child, level + 1))
        )}
      </Box>
    );
  };

  if (loading && items.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Initiatives</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {items.length} item{items.length !== 1 ? 's' : ''} total
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<AccountTree />}
            onClick={() => navigate('/mindmap')}
          >
            Mind Map
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
          >
            New Initiative
          </Button>
        </Box>
      </Box>

      {items.length === 0 ? (
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            border: '1px solid #e2e8f0',
            p: 6,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary" mb={2}>No initiatives yet. Create your first one!</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>Create Initiative</Button>
        </Box>
      ) : (
        <Box>{items.map(initiative => renderInitiative(initiative))}</Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>{editingId ? 'Edit Initiative' : 'New Initiative'}</DialogTitle>
        <Divider />
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="INITIATIVE">Initiative</MenuItem>
                  <MenuItem value="TASK">Task</MenuItem>
                  <MenuItem value="SUBTASK">Subtask</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={formData.priority}
                  label="Priority"
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <MenuItem value="CRITICAL">Critical</MenuItem>
                  <MenuItem value="HIGH">High</MenuItem>
                  <MenuItem value="MEDIUM">Medium</MenuItem>
                  <MenuItem value="LOW">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <MenuItem value="OPEN">Open</MenuItem>
                  <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                  <MenuItem value="BLOCKED">Blocked</MenuItem>
                  <MenuItem value="ON_HOLD">On Hold</MenuItem>
                  <MenuItem value="COMPLETED">Completed</MenuItem>
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} variant="outlined">Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={!formData.title}>
            {editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialog} onClose={() => setDetailsDialog(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Initiative Details</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selectedInitiative && (
            <Box>
              <Typography variant="h6" fontWeight={700} gutterBottom>{selectedInitiative.title}</Typography>
              {selectedInitiative.description && (
                <Typography variant="body2" color="text.secondary" paragraph>{selectedInitiative.description}</Typography>
              )}
              <Grid container spacing={2} mt={0.5}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" mb={0.5}>Status</Typography>
                  {(() => { const sc = STATUS_CONFIG[selectedInitiative.status] || STATUS_CONFIG.OPEN; return (
                    <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 500, border: 0 }} />
                  ); })()}
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" mb={0.5}>Priority</Typography>
                  {(() => { const pc = PRIORITY_CONFIG[selectedInitiative.priority] || PRIORITY_CONFIG.MEDIUM; return (
                    <Chip label={selectedInitiative.priority} size="small" sx={{ bgcolor: pc.bg, color: pc.color, fontWeight: 500, border: 0 }} />
                  ); })()}
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" mb={0.5}>Progress</Typography>
                  <Typography variant="body2">{selectedInitiative.progress ?? 0}%</Typography>
                </Grid>
                {selectedInitiative.children?.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" mb={0.75}>
                      Sub-items ({selectedInitiative.children.length})
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                      {selectedInitiative.children.map(child => (
                        <Chip key={child.id} label={child.title} size="small" sx={{ bgcolor: '#f1f5f9' }} />
                      ))}
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailsDialog(false)} variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
