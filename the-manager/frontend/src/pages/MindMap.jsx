import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
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
  Avatar,
  Autocomplete,
  Snackbar,
  Alert,
  Menu as MuiMenu,
  MenuItem as MuiMenuItem,
} from '@mui/material';
import { Add, List as ListIcon, Refresh, Label, PersonAdd, Download, SelectAll, CropFree, AutoFixHigh } from '@mui/icons-material';
import api from '../api/axios';
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

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const H_GAP = 90;
const V_GAP = 100;

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
    assigneeIds: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [users, setUsers] = useState([]);

  const allTags = useMemo(
    () => [...new Set((allItems || []).flatMap(i => i.tags || []))].sort(),
    [allItems]
  );

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  const { getNodes, fitView } = useReactFlow();
  const [exportMsg, setExportMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);

  const doCapture = async (filterFn = null, nodeIdsForFit = null) => {
    if (nodeIdsForFit) {
      fitView({ nodes: nodeIdsForFit.map(id => ({ id })), padding: 0.2, duration: 300 });
    } else {
      fitView({ padding: 0.15, duration: 300 });
    }
    await new Promise(r => setTimeout(r, 420));
    const rfEl = document.querySelector('.react-flow');
    if (!rfEl) return;
    await toPng(rfEl, {
      backgroundColor: '#f5f6fa',
      pixelRatio: 2,
      filter: node => {
        const cls = node?.classList;
        if (!cls) return true;
        if (cls.contains('react-flow__minimap')) return false;
        if (cls.contains('react-flow__controls')) return false;
        if (cls.contains('react-flow__panel')) return false;
        if (filterFn && !filterFn(node)) return false;
        return true;
      },
    }).then(dataUrl => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = nodeIdsForFit ? 'mindmap-selection.png' : 'mindmap.png';
      link.click();
      setExportMsg(nodeIdsForFit ? 'Selection exported!' : 'Image downloaded!');
    }).catch(() => setExportMsg('Export failed. Try again.'));
  };

  const handleExportImage = async () => {
    if (!getNodes().length) return;
    setExportMenuAnchor(null);
    setExporting(true);
    await doCapture();
    setExporting(false);
  };

  const handleExportSelected = async () => {
    const sel = getNodes().filter(n => n.selected);
    if (sel.length === 0) return;
    setExportMenuAnchor(null);
    setExporting(true);
    const selIds = sel.map(n => n.id);
    const selIdSet = new Set(selIds);

    // Remove selection highlight from selected nodes + hide unselected nodes
    setNodes(prev => prev.map(n => {
      if (selIdSet.has(n.id)) return { ...n, selected: false };
      return { ...n, style: { ...n.style, opacity: 0 } };
    }));

    // Hide any edge whose source or target is not in the selection
    setEdges(prev => prev.map(e =>
      selIdSet.has(e.source) && selIdSet.has(e.target)
        ? e
        : { ...e, style: { ...e.style, opacity: 0 } }
    ));

    // Wait for re-render then animate fit
    await new Promise(r => setTimeout(r, 80));
    fitView({ nodes: selIds.map(id => ({ id })), padding: 0.2, duration: 300 });
    await new Promise(r => setTimeout(r, 420));

    const rfEl = document.querySelector('.react-flow');
    if (rfEl) {
      await toPng(rfEl, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: node => {
          const cls = node?.classList;
          if (!cls) return true;
          if (cls.contains('react-flow__minimap')) return false;
          if (cls.contains('react-flow__controls')) return false;
          if (cls.contains('react-flow__panel')) return false;
          return true;
        },
      }).then(dataUrl => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'mindmap-selection.png';
        link.click();
        setExportMsg('Selection exported!');
      }).catch(() => setExportMsg('Export failed. Try again.'));
    }

    // Restore nodes: re-apply selection, remove opacity override
    setNodes(prev => prev.map(n => {
      if (selIdSet.has(n.id)) return { ...n, selected: true };
      const { opacity, ...rest } = n.style || {}; // eslint-disable-line no-unused-vars
      return { ...n, style: rest };
    }));

    // Restore edges
    setEdges(prev => prev.map(e => {
      if (selIdSet.has(e.source) && selIdSet.has(e.target)) return e;
      const { opacity, ...rest } = e.style || {}; // eslint-disable-line no-unused-vars
      return { ...e, style: rest };
    }));

    setExporting(false);
  };

  const savePositionTimer = useRef({});

  useEffect(() => {
    dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
  }, [dispatch, activeCanvasId]);

  useEffect(() => {
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

  // Client-side canvas filter (belt-and-suspenders in case API returns stale/unfiltered data)
  const displayItems = useMemo(() => {
    if (!activeCanvasId) return allItems;
    // Include items directly on this canvas plus any descendants (tasks/subtasks under them)
    const inCanvas = new Set(allItems.filter(i => i.canvasId === activeCanvasId).map(i => i.id));
    let changed = true;
    while (changed) {
      changed = false;
      allItems.forEach(i => {
        if (!inCanvas.has(i.id) && i.parentId && inCanvas.has(i.parentId)) {
          inCanvas.add(i.id);
          changed = true;
        }
      });
    }
    return allItems.filter(i => inCanvas.has(i.id));
  }, [allItems, activeCanvasId]);

  // Build children map (memoised)
  const childrenOf = useMemo(() => {
    const map = {};
    displayItems.forEach(i => {
      if (!map[i.id]) map[i.id] = [];
      if (i.parentId) {
        if (!map[i.parentId]) map[i.parentId] = [];
        if (!map[i.parentId].includes(i.id)) map[i.parentId].push(i.id);
      }
    });
    return map;
  }, [displayItems]);

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

  const autoArrange = useCallback(() => {
    if (!displayItems.length) return;

    // Snapshot current live positions from React Flow (respects unsaved drags too)
    const livePos = {};
    nodes.forEach(n => { livePos[n.id] = { x: n.position.x, y: n.position.y }; });

    const newPositions = {};

    // Process each parent's children:
    //   - Snap Y to parent.y + NODE_HEIGHT + V_GAP (clean depth alignment)
    //   - Blend X: 60% user position + 40% ideal center-under-parent
    //   - Resolve any remaining sibling overlaps with minimal rightward nudge
    //   - Roots are NEVER moved
    const processChildren = (parentId, parentPos) => {
      const children = childrenOf[parentId] || [];
      if (!children.length) return;

      const targetY = parentPos.y + NODE_HEIGHT + V_GAP;
      const parentCenterX = parentPos.x + NODE_WIDTH / 2;
      const totalW = children.length * NODE_WIDTH + (children.length - 1) * H_GAP;
      const idealStartX = parentCenterX - totalW / 2;

      // Sort siblings by current X to preserve the user's left-right order
      const sorted = [...children].sort((a, b) =>
        (livePos[a]?.x ?? 0) - (livePos[b]?.x ?? 0)
      );

      // Gently blend each child's X toward its ideal slot
      let blended = sorted.map((id, i) => {
        const userX = livePos[id]?.x ?? (idealStartX + i * (NODE_WIDTH + H_GAP));
        const idealX = idealStartX + i * (NODE_WIDTH + H_GAP);
        return { id, x: Math.round(userX * 0.6 + idealX * 0.4) };
      });

      // Re-sort blended positions and de-overlap (nudge right only if too close)
      blended.sort((a, b) => a.x - b.x);
      for (let i = 1; i < blended.length; i++) {
        const minX = blended[i - 1].x + NODE_WIDTH + H_GAP;
        if (blended[i].x < minX) blended[i].x = minX;
      }

      blended.forEach(({ id, x }) => {
        const newPos = { x, y: Math.round(targetY) };
        newPositions[id] = newPos;
        livePos[id] = newPos; // use updated pos for grandchildren
        processChildren(id, newPos);
      });
    };

    displayItems.filter(i => !i.parentId).forEach(root => {
      processChildren(root.id, livePos[root.id] || { x: 0, y: 0 });
    });

    if (!Object.keys(newPositions).length) return;

    setNodes(prev => prev.map(n => ({
      ...n,
      position: newPositions[n.id] || n.position,
    })));

    Object.entries(newPositions).forEach(([id, pos]) => {
      dispatch(updatePosition({ id, positionX: pos.x, positionY: pos.y }));
    });

    setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 120);
  }, [nodes, displayItems, childrenOf, dispatch, fitView]);

  // Build React Flow nodes + edges
  useEffect(() => {
    if (!displayItems.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const autoPositions = computeLayout(displayItems);

    const handleToggleCollapse = (id) => {
      setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenDetails = (initiative) => {
      setSelectedInitiativeId(initiative.id);
      setDetailsOpen(true);
    };

    const handleAddChild = (parentId, parentPriority) => {
      setCreateParentId(parentId);
      setFormData({ title: '', description: '', type: 'TASK', status: 'OPEN', priority: parentPriority || 'MEDIUM', tags: [], assigneeIds: [] });
      setTagInput('');
      setCreateDialogOpen(true);
    };

    const rfNodes = displayItems
      .filter(i => !hiddenIds.has(i.id))
      .map(initiative => {
        const savedPos = initiative.positionX != null && initiative.positionY != null;
        let pos;
        if (savedPos) {
          pos = { x: initiative.positionX, y: initiative.positionY };
        } else if (initiative.parentId) {
          // Place near parent if parent has a saved position
          const parent = displayItems.find(p => p.id === initiative.parentId);
          if (parent && parent.positionX != null && parent.positionY != null) {
            const placedSiblings = displayItems.filter(
              s => s.parentId === initiative.parentId && s.positionX != null && s.id !== initiative.id
            );
            const offsetX = placedSiblings.length * (NODE_WIDTH + H_GAP);
            pos = { x: parent.positionX + offsetX, y: parent.positionY + NODE_HEIGHT + V_GAP };
          } else {
            pos = autoPositions[initiative.id] || { x: 0, y: 0 };
          }
        } else {
          pos = autoPositions[initiative.id] || { x: 0, y: 0 };
        }

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

    const rfEdges = displayItems
      .filter(i => i.parentId && !hiddenIds.has(i.id) && !hiddenIds.has(i.parentId))
      .map(initiative => ({
        id: `e-${initiative.parentId}-${initiative.id}`,
        source: initiative.parentId,
        target: initiative.id,
        type: 'smoothstep',
        style: { stroke: '#c7d2fe', strokeWidth: 1.5, opacity: 0.85 },
        animated: initiative.status === 'IN_PROGRESS',
        markerEnd: { type: 'arrowclosed', width: 10, height: 10, color: '#c7d2fe' }
      }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [displayItems, collapsed, hiddenIds]);

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
    setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [], assigneeIds: [] });
    setTagInput('');
    dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
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
            {displayItems.length} initiative{displayItems.length !== 1 ? 's' : ''} · drag to rearrange
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <Tooltip title="Export as image">
            <span>
              <IconButton
                onClick={e => setExportMenuAnchor(e.currentTarget)}
                disabled={exporting}
                size="small"
                sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}
              >
                {exporting ? <CircularProgress size={16} /> : <Download fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <MuiMenu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
            PaperProps={{ sx: { borderRadius: 2, minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
          >
            <MuiMenuItem dense onClick={handleExportImage} sx={{ gap: 1.5 }}>
              <SelectAll sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" fontWeight={500}>Export all</Typography>
                <Typography variant="caption" color="text.secondary">Save entire mind map</Typography>
              </Box>
            </MuiMenuItem>
            <MuiMenuItem
              dense
              onClick={handleExportSelected}
              disabled={selectedNodeIds.length === 0}
              sx={{ gap: 1.5 }}
            >
              <CropFree sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  Export selected{selectedNodeIds.length > 0 ? ` (${selectedNodeIds.length})` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedNodeIds.length === 0 ? 'Select nodes first' : 'Save selected nodes only'}
                </Typography>
              </Box>
            </MuiMenuItem>
          </MuiMenu>
          <Tooltip title="Auto-arrange: clean up layout, keeping trees near their current positions">
            <IconButton
              onClick={autoArrange}
              size="small"
              sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}
            >
              <AutoFixHigh fontSize="small" />
            </IconButton>
          </Tooltip>
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
              setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [], assigneeIds: [] });
              setTagInput('');
              setCreateDialogOpen(true);
            }}
          >
            New Initiative
          </Button>
        </Box>
      </Box>

      {/* React Flow canvas */}
      <Box sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 3, overflow: 'hidden', bgcolor: '#f5f6fa' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={({ nodes: sel }) => setSelectedNodeIds((sel || []).map(n => n.id))}
          selectionOnDrag
          panOnDrag={[1, 2]}
          multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          selectionKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.5, maxZoom: 0.8 }}
          minZoom={0.08}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background variant="dots" color="#c7d2fe" gap={28} size={1.5} />
          <Controls
            style={{
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
          />
          <MiniMap
            nodeColor={(node) => STATUS_CONFIG[node.data?.initiative?.status]?.dot || '#94a3b8'}
            maskColor="rgba(99,102,241,0.06)"
            style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
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
        display="flex" gap={1} mt={1.5} flexWrap="wrap" alignItems="center"
        sx={{ px: 2, py: 0.75, bgcolor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)', borderRadius: 2, border: '1px solid #e2e8f0' }}
      >
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <Box key={status} display="flex" alignItems="center" gap={0.5}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: cfg.dot }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{cfg.label}</Typography>
          </Box>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        {Object.entries(PRIORITY_COLORS).map(([p, color]) => (
          <Box key={p} display="flex" alignItems="center" gap={0.4}>
            <Box sx={{ width: 3, height: 12, bgcolor: color, borderRadius: 1 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{p.charAt(0) + p.slice(1).toLowerCase()}</Typography>
          </Box>
        ))}
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
                    setFormData(f => ({ ...f, assigneeIds: v }));
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
                    <PersonAdd sx={{ fontSize: 16 }} />
                    <Typography variant="body2" fontWeight={500} color="#6366f1">New person…</Typography>
                  </MenuItem>
                </Select>
              </FormControl>
            )}
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
                onChange={(_, val) => { if (val) addFormTag(typeof val === 'string' ? val : ''); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    fullWidth
                    placeholder="Type a tag and press Enter or comma…"
                    onKeyDown={e => {
                      if (e.key === ',') { e.preventDefault(); addFormTag(tagInput); }
                    }}
                    onBlur={() => { if (tagInput.trim()) addFormTag(tagInput); }}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <Label sx={{ fontSize: 16, color: 'text.disabled' }} />
                        </InputAdornment>
                      )
                    }}
                  />
                )}
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
      {/* Export feedback */}
      <Snackbar
        open={!!exportMsg}
        autoHideDuration={3000}
        onClose={() => setExportMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setExportMsg('')} sx={{ width: '100%' }}>{exportMsg}</Alert>
      </Snackbar>

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

export default function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}
