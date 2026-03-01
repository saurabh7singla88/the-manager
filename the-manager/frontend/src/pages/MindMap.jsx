import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
} from '@mui/material';
import { Add, List as ListIcon, Refresh, Label } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  fetchAllInitiatives,
  updatePosition,
  createInitiative,
} from '../features/initiatives/initiativesSlice';
import MindMapNode from '../components/MindMapNode';
import InitiativeDetailDrawer from '../components/InitiativeDetailDrawer';
import CanvasSelector from '../components/CanvasSelector';

const NODE_TYPES = { initiative: MindMapNode };

const NODE_WIDTH = 230;
const NODE_HEIGHT = 115;
const H_GAP = 60;
const V_GAP = 80;

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
  IN_PROGRESS: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe', dot: '#3b82f6' },
  BLOCKED:     { label: 'Blocked',     color: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  ON_HOLD:     { label: 'On Hold',     color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  COMPLETED:   { label: 'Completed',   color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
};

const PRIORITY_COLORS = {
  CRITICAL: '#dc2626',
  HIGH:     '#d97706',
  MEDIUM:   '#6366f1',
  LOW:      '#94a3b8',
};

// Auto tree layout algorithm
function computeLayout(initiatives) {
  const childrenOf = {};
  initiatives.forEach(init => {
    if (!childrenOf[init.id]) childrenOf[init.id] = [];
    if (init.parentId) {
      if (!childrenOf[init.parentId]) childrenOf[init.parentId] = [];
      if (!childrenOf[init.parentId].includes(init.id)) {
        childrenOf[init.parentId].push(init.id);
      }
    }
  });

  const subtreeWidth = {};
  const computeWidth = (id) => {
    const children = childrenOf[id] || [];
    if (children.length === 0) {
      subtreeWidth[id] = NODE_WIDTH;
      return NODE_WIDTH;
    }
    const total = children.reduce((sum, cid) => sum + computeWidth(cid) + H_GAP, -H_GAP);
    subtreeWidth[id] = Math.max(NODE_WIDTH, total);
    return subtreeWidth[id];
  };

  const roots = initiatives.filter(i => !i.parentId);
  roots.forEach(r => computeWidth(r.id));

  const positions = {};
  const placeNode = (id, x, y) => {
    positions[id] = { x, y };
    const children = childrenOf[id] || [];
    if (!children.length) return;
    const totalW = children.reduce((sum, cid) => sum + (subtreeWidth[cid] || NODE_WIDTH) + H_GAP, -H_GAP);
    let cx = x - totalW / 2;
    children.forEach(cid => {
      const cw = subtreeWidth[cid] || NODE_WIDTH;
      placeNode(cid, cx + cw / 2, y + NODE_HEIGHT + V_GAP);
      cx += cw + H_GAP;
    });
  };

  let rx = 0;
  roots.forEach(r => {
    const rw = subtreeWidth[r.id] || NODE_WIDTH;
    placeNode(r.id, rx + rw / 2, 0);
    rx += rw + H_GAP * 3;
  });

  return positions;
}

// Get all descendant IDs of a collapsed node
function getDescendants(id, childrenOf) {
  const result = new Set();
  const queue = [...(childrenOf[id] || [])];
  while (queue.length) {
    const cur = queue.shift();
    result.add(cur);
    (childrenOf[cur] || []).forEach(c => queue.push(c));
  }
  return result;
}

function MindMapInner() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allItems, allItemsLoading } = useSelector(state => state.initiatives);
  const { activeCanvasId } = useSelector(state => state.canvas);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [collapsed, setCollapsed] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'INITIATIVE',
    status: 'OPEN',
    priority: 'MEDIUM',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  const savePositionTimer = useRef({});

  useEffect(() => {
    dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
  }, [dispatch, activeCanvasId]);

  // Build children map (memoised)
  const childrenOf = useMemo(() => {
    const map = {};
    allItems.forEach(i => {
      if (!map[i.id]) map[i.id] = [];
      if (i.parentId) {
        if (!map[i.parentId]) map[i.parentId] = [];
        if (!map[i.parentId].includes(i.id)) map[i.parentId].push(i.id);
      }
    });
    return map;
  }, [allItems]);

  // Compute hidden nodes (collapsed subtrees)
  const hiddenIds = useMemo(() => {
    const hidden = new Set();
    Object.entries(collapsed).forEach(([id, isCollapsed]) => {
      if (isCollapsed) {
        getDescendants(id, childrenOf).forEach(d => hidden.add(d));
      }
    });
    return hidden;
  }, [collapsed, childrenOf]);

  // Build React Flow nodes + edges
  useEffect(() => {
    if (!allItems.length) return;

    const autoPositions = computeLayout(allItems);

    const handleToggleCollapse = (id) => {
      setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenDetails = (initiative) => {
      setSelectedInitiativeId(initiative.id);
      setDetailsOpen(true);
    };

    const handleAddChild = (parentId, parentPriority) => {
      setCreateParentId(parentId);
      setFormData({ title: '', description: '', type: 'TASK', status: 'OPEN', priority: parentPriority || 'MEDIUM', tags: [] });
      setTagInput('');
      setCreateDialogOpen(true);
    };

    const rfNodes = allItems
      .filter(i => !hiddenIds.has(i.id))
      .map(initiative => {
        const savedPos = initiative.positionX != null && initiative.positionY != null;
        const pos = savedPos
          ? { x: initiative.positionX, y: initiative.positionY }
          : (autoPositions[initiative.id] || { x: 0, y: 0 });

        return {
          id: initiative.id,
          type: 'initiative',
          position: pos,
          data: {
            initiative,
            isCollapsed: !!collapsed[initiative.id],
            onToggleCollapse: handleToggleCollapse,
            onOpenDetails: handleOpenDetails,
            onAddChild: handleAddChild
          }
        };
      });

    const rfEdges = allItems
      .filter(i => i.parentId && !hiddenIds.has(i.id) && !hiddenIds.has(i.parentId))
      .map(initiative => ({
        id: `e-${initiative.parentId}-${initiative.id}`,
        source: initiative.parentId,
        target: initiative.id,
        type: 'smoothstep',
        style: { stroke: '#c7d2fe', strokeWidth: 2 },
        animated: initiative.status === 'IN_PROGRESS'
      }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [allItems, collapsed, hiddenIds]);

  const onNodeDragStop = useCallback((_, node, draggedNodes) => {
    // Save positions for all nodes that moved (supports group drag)
    const toSave = draggedNodes?.length > 1 ? draggedNodes : [node];
    toSave.forEach(n => {
      if (savePositionTimer.current[n.id]) clearTimeout(savePositionTimer.current[n.id]);
      savePositionTimer.current[n.id] = setTimeout(() => {
        dispatch(updatePosition({
          id: n.id,
          positionX: n.position.x,
          positionY: n.position.y
        }));
      }, 500);
    });
  }, [dispatch]);

  const onNodeDoubleClick = useCallback((_, node) => {
    setSelectedInitiativeId(node.data.initiative.id);
    setDetailsOpen(true);
  }, []);

  const handleCreateSubmit = async () => {
    await dispatch(createInitiative({ ...formData, parentId: createParentId, ...(activeCanvasId ? { canvasId: activeCanvasId } : {}) }));
    setCreateDialogOpen(false);
    setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [] });
    setTagInput('');
    dispatch(fetchAllInitiatives());
  };

  const addFormTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || formData.tags.includes(trimmed)) return;
    setFormData(prev => ({ ...prev, tags: [...prev.tags, trimmed] }));
    setTagInput('');
  };

  const removeFormTag = (tag) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  if (allItemsLoading && !allItems.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column' }}>
      <CanvasSelector />
      {/* Toolbar */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Mind Map</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {allItems.length} initiative{allItems.length !== 1 ? 's' : ''} · drag to rearrange
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }))}
              size="small"
              sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<ListIcon />}
            onClick={() => navigate('/initiatives')}
          >
            List View
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              setCreateParentId(null);
              setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [] });
              setTagInput('');
              setCreateDialogOpen(true);
            }}
          >
            New Initiative
          </Button>
        </Box>
      </Box>

      {/* React Flow canvas */}
      <Box sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden', bgcolor: '#fafbff' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          selectionOnDrag
          panOnDrag={[1, 2]}
          multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          selectionKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background color="#c7d2fe" gap={24} size={1} />
          <Controls style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <MiniMap
            nodeColor={(node) => STATUS_CONFIG[node.data?.initiative?.status]?.dot || '#94a3b8'}
            maskColor="rgba(99,102,241,0.04)"
            style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          {allItems.length === 0 && (
            <Panel position="top-center">
              <Box sx={{ bgcolor: 'white', p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <Typography variant="body2" color="text.secondary" mb={1.5}>No initiatives yet.</Typography>
                <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setCreateDialogOpen(true)}>
                  Create First Initiative
                </Button>
              </Box>
            </Panel>
          )}
          <Panel position="bottom-center">
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)', border: '1px solid #e2e8f0', borderRadius: 6, px: 1.75, py: 0.5, display: 'flex', gap: 2 }}>
              <Typography variant="caption" color="text.disabled">Drag canvas to select · Shift+click to add · Double-click to open</Typography>
            </Box>
          </Panel>
        </ReactFlow>
      </Box>

      {/* Legend */}
      <Box
        display="flex" gap={0.75} mt={1.5} flexWrap="wrap" alignItems="center"
        sx={{ px: 1.5, py: 1, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid #e2e8f0' }}
      >
        <Typography variant="caption" color="text.disabled" fontWeight={500} mr={0.5}>Status:</Typography>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <Box key={status} display="flex" alignItems="center" gap={0.4}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cfg.dot }} />
            <Typography variant="caption" color="text.secondary">{cfg.label}</Typography>
          </Box>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
        <Typography variant="caption" color="text.disabled" fontWeight={500} mr={0.5}>Priority (left border):</Typography>
        {Object.entries(PRIORITY_COLORS).map(([p, color]) => (
          <Box key={p} display="flex" alignItems="center" gap={0.4}>
            <Box sx={{ width: 3, height: 14, bgcolor: color, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">{p.charAt(0) + p.slice(1).toLowerCase()}</Typography>
          </Box>
        ))}
        <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
          · Animated edges = In Progress
        </Typography>
      </Box>

      {/* Detail Drawer (full tabs: Overview, Links, Comments, Activity) */}
      <InitiativeDetailDrawer
        open={detailsOpen}
        initiativeId={selectedInitiativeId}
        onClose={() => setDetailsOpen(false)}
      />

      {/* Create Initiative Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {createParentId ? 'Add Child Item' : 'New Initiative'}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
            <TextField
              fullWidth
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              autoFocus
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <Box display="flex" gap={2}>
              <FormControl fullWidth size="small">
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
              <FormControl fullWidth size="small">
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
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                TAGS
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={0.75}>
                {formData.tags.map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => removeFormTag(tag)}
                    sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', border: 0, fontWeight: 500, fontSize: '0.72rem' }}
                  />
                ))}
              </Box>
              <TextField
                size="small"
                fullWidth
                placeholder="Type a tag and press Enter or comma…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addFormTag(tagInput);
                  }
                }}
                onBlur={() => { if (tagInput.trim()) addFormTag(tagInput); }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Label sx={{ fontSize: 16, color: 'text.disabled' }} />
                    </InputAdornment>
                  )
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleCreateSubmit} variant="contained" disabled={!formData.title.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}
