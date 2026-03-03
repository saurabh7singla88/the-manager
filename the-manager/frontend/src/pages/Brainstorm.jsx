import { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  ConnectionMode,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, Tooltip, IconButton, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert,
  Divider,
} from '@mui/material';
import {
  CropSquare, Circle, ChangeHistory, StickyNote2, TextFields,
  RocketLaunch, DeleteOutline, ClearAll, Lightbulb,
} from '@mui/icons-material';
import { fetchCanvases } from '../features/canvas/canvasSlice';
import { useEffect } from 'react';
import api from '../api/axios';

// ─── Shape constants ───────────────────────────────────────────────────────────
const SHAPE_TYPES = [
  { type: 'box',     label: 'Box',     icon: <CropSquare fontSize="small" />,    title: 'Rectangle' },
  { type: 'circle',  label: 'Circle',  icon: <Circle fontSize="small" />,        title: 'Circle' },
  { type: 'diamond', label: 'Diamond', icon: <ChangeHistory fontSize="small" />, title: 'Diamond' },
  { type: 'sticky',  label: 'Sticky',  icon: <StickyNote2 fontSize="small" />,   title: 'Sticky Note' },
  { type: 'text',    label: 'Text',    icon: <TextFields fontSize="small" />,    title: 'Text' },
];

// ─── Custom node styles ────────────────────────────────────────────────────────
const nodeBase = {
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'default',
  position: 'relative',
  transition: 'box-shadow .15s',
  minWidth: 110,
  minHeight: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  wordBreak: 'break-word',
};

const NODE_STYLE_MAP = {
  box: {
    ...nodeBase,
    background: '#eef2ff',
    border: '2px solid #6366f1',
    borderRadius: 10,
    color: '#3730a3',
  },
  circle: {
    ...nodeBase,
    background: '#f0fdf4',
    border: '2px solid #22c55e',
    borderRadius: '50%',
    color: '#15803d',
    width: 110,
    height: 110,
    minWidth: 'unset',
    minHeight: 'unset',
  },
  diamond: {
    ...nodeBase,
    background: '#fff7ed',
    border: '2px solid #f97316',
    color: '#c2410c',
    width: 110,
    height: 110,
    minWidth: 'unset',
    minHeight: 'unset',
    transform: 'rotate(45deg)',
  },
  sticky: {
    ...nodeBase,
    background: '#fef9c3',
    border: '1.5px solid #eab308',
    borderRadius: 4,
    color: '#78350f',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.12)',
    minWidth: 130,
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  text: {
    ...nodeBase,
    background: 'transparent',
    border: 'none',
    color: '#1e293b',
    fontWeight: 600,
    fontSize: 15,
    padding: '4px 8px',
  },
};

// ─── Custom handle style ──────────────────────────────────────────────────────
const HANDLE_STYLE = {
  width: 10,
  height: 10,
  background: '#6366f1',
  border: '2px solid #fff',
  borderRadius: '50%',
};

// ─── Custom node components ───────────────────────────────────────────────────
// One source handle per side. ConnectionMode.Loose lets them receive connections too.
function Handles() {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="t" style={{ ...HANDLE_STYLE, top:    -6, left: '50%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ ...HANDLE_STYLE, bottom: -6, left: '50%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Left}   id="l" style={{ ...HANDLE_STYLE, left:   -6, top:  '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right}  id="r" style={{ ...HANDLE_STYLE, right:  -6, top:  '50%', transform: 'translateY(-50%)' }} />
    </>
  );
}

function ShapeNode({ id, data, type, selected }) {
  const style = {
    ...NODE_STYLE_MAP[type],
    boxShadow: selected ? '0 0 0 2.5px #6366f1' : NODE_STYLE_MAP[type].boxShadow || 'none',
  };

  const innerStyle = type === 'diamond' ? { transform: 'rotate(-45deg)' } : {};

  return (
    <div className="bs-node" style={style}>
      <Handles />
      {data.editing ? (
        <textarea
          autoFocus
          defaultValue={data.label}
          style={{
            ...innerStyle,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            fontWeight: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            width: '100%',
            textAlign: 'center',
          }}
          onBlur={e => data.onEditDone(id, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); data.onEditDone(id, e.target.value); } }}
        />
      ) : (
        <span style={innerStyle}>{data.label || <span style={{ opacity: 0.4 }}>double-click to edit</span>}</span>
      )}
      {data.pushed && (
        <span style={{
          ...innerStyle,
          position: 'absolute', top: -10, right: -10,
          background: '#22c55e', color: '#fff',
          borderRadius: '50%', width: 18, height: 18,
          fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}>✓</span>
      )}
    </div>
  );
}

const BoxNode    = (p) => <ShapeNode {...p} type="box" />;
const CircleNode = (p) => <ShapeNode {...p} type="circle" />;
const DiamondNode= (p) => <ShapeNode {...p} type="diamond" />;
const StickyNode = (p) => <ShapeNode {...p} type="sticky" />;
const TextNode   = (p) => <ShapeNode {...p} type="text" />;

const NODE_TYPES = { box: BoxNode, circle: CircleNode, diamond: DiamondNode, sticky: StickyNode, text: TextNode };

// ─── Counter for unique IDs ───────────────────────────────────────────────────
let nodeCounter = 1;
const newId = () => `bs-${nodeCounter++}`;

// ─── Main inner component (inside ReactFlowProvider) ─────────────────────────
function BrainstormInner() {
  const dispatch = useDispatch();
  const { canvases } = useSelector(s => s.canvas);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const saveTimer = useRef(null);
  const isFirstRender = useRef(true);
  const [pendingShape, setPendingShape] = useState(null); // shape type waiting to be placed
  const [editingId, setEditingId] = useState(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushNodes, setPushNodes] = useState([]); // nodes to push
  const [pushForm, setPushForm] = useState({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', canvasId: '' });
  const [pushing, setPushing] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });
  const { screenToFlowPosition } = useReactFlow();
  const flowRef = useRef(null);

  useEffect(() => { dispatch(fetchCanvases()); }, [dispatch]);

  // Load canvas from DB on mount
  useEffect(() => {
    api.get('/brainstorm').then(r => {
      const loaded = (r.data.nodes || []).map(n => ({ ...n, data: { ...n.data, onEditDone: handleEditDone, editing: false } }));
      setNodes(loaded);
      setEdges(r.data.edges || []);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to DB whenever nodes or edges change
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const serialisable = nodes.map(n => ({ ...n, data: { ...n.data, onEditDone: undefined, editing: false } }));
      api.put('/brainstorm', { nodes: serialisable, edges }).catch(() => {});
    }, 1000);
  }, [nodes, edges]);

  // Sync editing state into node data
  useEffect(() => {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: {
        ...n.data,
        editing: n.id === editingId,
        onEditDone: handleEditDone,
      },
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const handleEditDone = useCallback((id, value) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, data: { ...n.data, label: value.trim() || n.data.label, editing: false } } : n
    ));
    setEditingId(null);
  }, []);

  const onConnect = useCallback(params => {
    setEdges(prev => addEdge({
      ...params,
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed', width: 10, height: 10, color: '#94a3b8' },
    }, prev));
  }, [setEdges]);

  const onPaneClick = useCallback((e) => {
    if (!pendingShape) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = newId();
    setNodes(prev => [...prev, {
      id,
      type: pendingShape,
      position: { x: pos.x - 55, y: pos.y - 30 },
      data: {
        label: '',
        editing: true,
        onEditDone: handleEditDone,
        pushed: false,
      },
    }]);
    setEditingId(id);
    setPendingShape(null);
  }, [pendingShape, screenToFlowPosition, handleEditDone]);

  const onNodeDoubleClick = useCallback((_, node) => {
    setEditingId(node.id);
  }, []);

  const onKeyDown = useCallback((e) => {
    if (editingId) return; // don't delete while editing
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setNodes(prev => prev.filter(n => !n.selected));
      setEdges(prev => prev.filter(ed => !ed.selected));
    }
  }, [editingId, setNodes, setEdges]);

  const selectedNodes = nodes.filter(n => n.selected);

  // ─── Push to initiative ────────────────────────────────────────────────────
  const openPush = () => {
    const sel = nodes.filter(n => n.selected);
    if (!sel.length) return;
    setPushNodes(sel);
    setPushForm({
      title: sel[0].data.label || '',
      description: '',
      type: 'INITIATIVE',
      status: 'OPEN',
      priority: 'MEDIUM',
      canvasId: '',
    });
    setPushOpen(true);
  };

  const doPush = async () => {
    if (!pushForm.title.trim()) return;
    setPushing(true);
    try {
      const selIds = new Set(pushNodes.map(n => n.id));
      const selEdges = edges.filter(e => selIds.has(e.source) && selIds.has(e.target));

      // Build adjacency to find parent-child relationships
      const childrenOf = {};
      const hasIncoming = new Set();
      selEdges.forEach(e => {
        if (!childrenOf[e.source]) childrenOf[e.source] = [];
        childrenOf[e.source].push(e.target);
        hasIncoming.add(e.target);
      });

      const roots = pushNodes.filter(n => !hasIncoming.has(n.id));
      const nodeById = Object.fromEntries(pushNodes.map(n => [n.id, n]));

      const createNode = async (nodeId, parentInitiativeId) => {
        const n = nodeById[nodeId];
        const payload = {
          title: (nodeId === pushNodes[0].id ? pushForm.title : n.data.label) || 'Untitled',
          description: nodeId === pushNodes[0].id ? pushForm.description : '',
          type: parentInitiativeId ? 'TASK' : pushForm.type,
          status: pushForm.status,
          priority: pushForm.priority,
          ...(pushForm.canvasId && { canvasId: pushForm.canvasId }),
          ...(parentInitiativeId && { parentId: parentInitiativeId }),
        };
        const res = await api.post('/initiatives', payload);
        const children = childrenOf[nodeId] || [];
        for (const childId of children) {
          await createNode(childId, res.data.id);
        }
      };

      for (const root of roots.length ? roots : [pushNodes[0]]) {
        await createNode(root.id, null);
      }

      // Mark pushed nodes with ✓
      const pushedIds = new Set(pushNodes.map(n => n.id));
      setNodes(prev => prev.map(n =>
        pushedIds.has(n.id) ? { ...n, data: { ...n.data, pushed: true } } : n
      ));
      setPushOpen(false);
      setSnack({ open: true, msg: `${pushNodes.length === 1 ? 'Initiative' : `${pushNodes.length} initiatives`} created successfully!`, severity: 'success' });
    } catch {
      setSnack({ open: true, msg: 'Failed to push to initiatives.', severity: 'error' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f8faff' }}>
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap',
        zIndex: 10, flexShrink: 0,
      }}>
        {/* Page title */}
        <Box display="flex" alignItems="center" gap={1} mr={1}>
          <Lightbulb sx={{ color: '#f59e0b', fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            Brainstorm
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Shape buttons */}
        {SHAPE_TYPES.map(s => (
          <Tooltip key={s.type} title={s.title}>
            <Chip
              icon={s.icon}
              label={s.label}
              size="small"
              onClick={() => setPendingShape(prev => prev === s.type ? null : s.type)}
              sx={{
                cursor: 'pointer',
                fontWeight: pendingShape === s.type ? 700 : 400,
                bgcolor: pendingShape === s.type ? '#eef2ff' : '#f8fafc',
                border: pendingShape === s.type ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
                color: pendingShape === s.type ? '#4338ca' : 'text.secondary',
                '& .MuiChip-icon': { color: pendingShape === s.type ? '#6366f1' : 'text.disabled' },
              }}
            />
          </Tooltip>
        ))}

        {pendingShape && (
          <Typography variant="caption" color="primary.main" fontWeight={600} sx={{ ml: 0.5 }}>
            Click on the canvas to place
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Action buttons */}
        <Tooltip title="Delete selected (or press Delete key)">
          <span>
            <IconButton
              size="small"
              disabled={!selectedNodes.length}
              onClick={() => { setNodes(p => p.filter(n => !n.selected)); setEdges(p => p.filter(e => !e.selected)); }}
              sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'error.main' }}
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Clear entire canvas">
          <IconButton
            size="small"
            onClick={() => { if (window.confirm('Clear the entire canvas?')) { setNodes([]); setEdges([]); api.put('/brainstorm', { nodes: [], edges: [] }).catch(() => {}); } }}
            sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}
          >
            <ClearAll fontSize="small" />
          </IconButton>
        </Tooltip>

        <Button
          variant="contained"
          size="small"
          startIcon={<RocketLaunch fontSize="small" />}
          disabled={selectedNodes.length === 0}
          onClick={openPush}
          sx={{ borderRadius: 2, fontWeight: 600, textTransform: 'none', ml: 0.5 }}
        >
          Push to Initiative{selectedNodes.length > 1 ? ` (${selectedNodes.length})` : ''}
        </Button>
      </Box>

      {/* ── Hint bar ─────────────────────────────────────────────────────────── */}
      <Box sx={{ px: 2, py: 0.5, bgcolor: '#f1f5f9', borderBottom: '1px solid #e9eef5', flexShrink: 0 }}>
        <Typography variant="caption" color="text.disabled">
          Choose a shape above → click canvas to place &nbsp;·&nbsp; Drag handles to connect &nbsp;·&nbsp; Double-click to edit label &nbsp;·&nbsp; Delete key removes selection &nbsp;·&nbsp; Select nodes → Push to Initiative
        </Typography>
      </Box>

      {/* ── Canvas ───────────────────────────────────────────────────────────── */}
      <Box
        ref={flowRef}
        sx={{ flex: 1, cursor: pendingShape ? 'crosshair' : 'default' }}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={NODE_TYPES}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={null} // we handle delete ourselves to guard editing
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            markerEnd: { type: 'arrowclosed', width: 10, height: 10, color: '#94a3b8' },
          }}
        >
          <Background color="#e2e8f0" gap={18} size={1} />
          <Controls />
          <MiniMap
            nodeColor={n => ({ box: '#6366f1', circle: '#22c55e', diamond: '#f97316', sticky: '#eab308', text: '#94a3b8' }[n.type] || '#6366f1')}
            nodeStrokeWidth={2}
            style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
          />
        </ReactFlow>
      </Box>

      {/* ── Push to initiative dialog ─────────────────────────────────────────  */}
      <Dialog
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketLaunch sx={{ color: '#6366f1', fontSize: 20 }} />
          Push to Initiative
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {pushNodes.length > 1 && (
            <Box sx={{ p: 1.5, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
              <Typography variant="caption" color="success.main" fontWeight={600}>
                {pushNodes.length} nodes selected — edges between them will determine parent → child relationships. The root node becomes the parent initiative.
              </Typography>
            </Box>
          )}
          <TextField
            label="Title"
            value={pushForm.title}
            onChange={e => setPushForm(f => ({ ...f, title: e.target.value }))}
            fullWidth
            size="small"
            autoFocus
          />
          <TextField
            label="Description (optional)"
            value={pushForm.description}
            onChange={e => setPushForm(f => ({ ...f, description: e.target.value }))}
            fullWidth
            size="small"
            multiline
            rows={2}
          />
          <Box display="flex" gap={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select value={pushForm.type} label="Type" onChange={e => setPushForm(f => ({ ...f, type: e.target.value }))}>
                <MenuItem value="INITIATIVE">Initiative</MenuItem>
                <MenuItem value="TASK">Task</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={pushForm.status} label="Status" onChange={e => setPushForm(f => ({ ...f, status: e.target.value }))}>
                {['OPEN','IN_PROGRESS','BLOCKED','ON_HOLD','COMPLETED','CANCELLED'].map(s => (
                  <MenuItem key={s} value={s}>{s.replace('_',' ')}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select value={pushForm.priority} label="Priority" onChange={e => setPushForm(f => ({ ...f, priority: e.target.value }))}>
                {['CRITICAL','HIGH','MEDIUM','LOW'].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <FormControl fullWidth size="small">
            <InputLabel>Canvas (optional)</InputLabel>
            <Select
              value={pushForm.canvasId}
              label="Canvas (optional)"
              onChange={e => setPushForm(f => ({ ...f, canvasId: e.target.value }))}
            >
              <MenuItem value="">None</MenuItem>
              {canvases.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color }} />
                    {c.name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPushOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={doPush}
            disabled={pushing || !pushForm.title.trim()}
            startIcon={<RocketLaunch fontSize="small" />}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            {pushing ? 'Creating…' : 'Create Initiative'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))} sx={{ borderRadius: 2 }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Exported page (wrapped in ReactFlowProvider) ─────────────────────────────
export default function Brainstorm() {
  return (
    <ReactFlowProvider>
      <BrainstormInner />
    </ReactFlowProvider>
  );
}
