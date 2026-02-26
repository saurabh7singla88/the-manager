import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  CircularProgress
} from '@mui/material';
import { Add, Edit, Delete, ExpandMore, ExpandLess } from '@mui/icons-material';
import {
  fetchInitiatives,
  createInitiative,
  updateInitiative,
  deleteInitiative,
  updateStatus,
  updatePriority,
  fetchInitiativeById
} from '../features/initiatives/initiativesSlice';
import { format } from 'date-fns';

const STATUS_COLORS = {
  OPEN: 'default',
  IN_PROGRESS: 'info',
  BLOCKED: 'error',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'default'
};

const PRIORITY_COLORS = {
  CRITICAL: 'error',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'default'
};

export default function InitiativesList() {
  const dispatch = useDispatch();
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

  const handleSubmit = async () => {
    if (editingId) {
      await dispatch(updateInitiative({ id: editingId, data: formData }));
    } else {
      await dispatch(createInitiative(formData));
    }
    handleCloseDialog();
    dispatch(fetchInitiatives({ parentId: 'null' }));
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
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderInitiative = (initiative, level = 0) => (
    <Box key={initiative.id} sx={{ ml: level * 4 }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="start">
            <Box sx={{ flex: 1 }}>
              <Box display="flex" alignItems="center" gap={1}>
                {initiative._count?.children > 0 && (
                  <IconButton size="small" onClick={() => toggleExpand(initiative.id)}>
                    {expanded[initiative.id] ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                )}
                <Typography variant="h6">{initiative.title}</Typography>
                <Chip
                  size="small"
                  label={initiative.type}
                  variant="outlined"
                />
              </Box>
              {initiative.description && (
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1, ml: initiative._count?.children > 0 ? 5 : 0 }}>
                  {initiative.description}
                </Typography>
              )}
              <Box display="flex" gap={1} mt={2} ml={initiative._count?.children > 0 ? 5 : 0}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={initiative.status}
                    onChange={(e) => handleStatusChange(initiative.id, e.target.value)}
                  >
                    <MenuItem value="OPEN">Open</MenuItem>
                    <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                    <MenuItem value="BLOCKED">Blocked</MenuItem>
                    <MenuItem value="ON_HOLD">On Hold</MenuItem>
                    <MenuItem value="COMPLETED">Completed</MenuItem>
                    <MenuItem value="CANCELLED">Cancelled</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={initiative.priority}
                    onChange={(e) => handlePriorityChange(initiative.id, e.target.value)}
                  >
                    <MenuItem value="CRITICAL">Critical</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="LOW">Low</MenuItem>
                  </Select>
                </FormControl>
                <Chip
                  size="small"
                  label={initiative.assignees?.length || 0}
                  icon={<>👥</>}
                />
                {initiative._count?.children > 0 && (
                  <Chip
                    size="small"
                    label={`${initiative._count.children} sub-items`}
                    variant="outlined"
                  />
                )}
              </Box>
              {initiative.createdBy && (
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1, ml: initiative._count?.children > 0 ? 5 : 0 }}>
                  Created by {initiative.createdBy.name} on {format(new Date(initiative.createdAt), 'MMM dd, yyyy')}
                </Typography>
              )}
            </Box>
            <Box display="flex" gap={1}>
              <IconButton size="small" onClick={() => handleViewDetails(initiative.id)} title="View Details">
                <Add />
              </IconButton>
              <IconButton size="small" onClick={() => handleOpenDialog(null, initiative)} title="Edit">
                <Edit />
              </IconButton>
              <IconButton size="small" onClick={() => handleDelete(initiative.id)} color="error" title="Delete">
                <Delete />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>
      {expanded[initiative.id] && initiative.children?.map(child => renderInitiative(child, level + 1))}
    </Box>
  );

  if (loading && items.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Initiatives</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          New Initiative
        </Button>
      </Box>

      {items.length === 0 ? (
        <Card>
          <CardContent>
            <Typography align="center" color="textSecondary">
              No initiatives yet. Create your first one!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        items.map(initiative => renderInitiative(initiative))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Initiative' : 'New Initiative'}</DialogTitle>
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
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={!formData.title}>
            {editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialog} onClose={() => setDetailsDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Initiative Details</DialogTitle>
        <DialogContent>
          {selectedInitiative && (
            <Box>
              <Typography variant="h6" gutterBottom>{selectedInitiative.title}</Typography>
              <Typography variant="body1" paragraph>{selectedInitiative.description}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Status</Typography>
                  <Chip label={selectedInitiative.status.replace('_', ' ')} color={STATUS_COLORS[selectedInitiative.status]} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Priority</Typography>
                  <Chip label={selectedInitiative.priority} color={PRIORITY_COLORS[selectedInitiative.priority]} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Progress</Typography>
                  <Typography>{selectedInitiative.progress}%</Typography>
                </Grid>
                {selectedInitiative.children?.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Sub-items ({selectedInitiative.children.length})</Typography>
                    {selectedInitiative.children.map(child => (
                      <Chip key={child.id} label={child.title} size="small" sx={{ mr: 1, mt: 1 }} />
                    ))}
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
