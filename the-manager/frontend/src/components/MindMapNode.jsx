import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography, LinearProgress, IconButton, Tooltip } from '@mui/material';
import { ExpandMore, ExpandLess, OpenInNew, AddCircleOutline } from '@mui/icons-material';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9', border: '#94a3b8' },
  IN_PROGRESS: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe', border: '#3b82f6' },
  BLOCKED:     { label: 'Blocked',     color: '#b91c1c', bg: '#fee2e2', border: '#ef4444' },
  ON_HOLD:     { label: 'On Hold',     color: '#b45309', bg: '#fef3c7', border: '#f59e0b' },
  COMPLETED:   { label: 'Completed',   color: '#065f46', bg: '#d1fae5', border: '#10b981' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6', border: '#9ca3af' },
};

const PRIORITY_COLORS = {
  CRITICAL: '#dc2626',
  HIGH:     '#d97706',
  MEDIUM:   '#6366f1',
  LOW:      '#94a3b8',
};

function MindMapNode({ data, selected }) {
  const { initiative, onToggleCollapse, isCollapsed, onOpenDetails, onAddChild } = data;
  const hasChildren = (initiative._count?.children ?? 0) > 0;
  const sc = STATUS_CONFIG[initiative.status] || STATUS_CONFIG.OPEN;
  const priorityColor = PRIORITY_COLORS[initiative.priority] || '#94a3b8';

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: 'rgba(255,255,255,0.97)',
        border: `1px solid ${selected ? '#6366f1' : 'rgba(0,0,0,0.07)'}`,
        borderLeft: `4px solid ${priorityColor}`,
        borderRadius: '14px',
        p: '14px 14px 12px',
        minWidth: 210,
        maxWidth: 260,
        boxShadow: selected
          ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 24px rgba(0,0,0,0.13)'
          : '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
        userSelect: 'none',
        backdropFilter: 'blur(4px)',
        transition: 'box-shadow 0.18s, border-color 0.18s, transform 0.12s',
        '&:hover': {
          boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
          borderColor: selected ? '#6366f1' : 'rgba(99,102,241,0.35)',
          transform: 'translateY(-1px)',
        },
        '&:hover .add-child-tip': { opacity: 1, transform: 'translateX(-50%) scale(1)' },
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />

      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={0.5}>
        <Typography
          fontWeight={600}
          sx={{ wordBreak: 'break-word', flex: 1, lineHeight: 1.4, fontSize: '0.86rem', color: '#1e293b', letterSpacing: '-0.01em' }}
        >
          {initiative.title}
        </Typography>
        <Box display="flex" alignItems="center" sx={{ flexShrink: 0, ml: 0.5, mt: -0.25 }}>
          {hasChildren && (
            <Tooltip title={isCollapsed ? 'Expand' : 'Collapse'}>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(initiative.id); }}
                sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#6366f1', bgcolor: '#eff6ff' }, borderRadius: 1 }}
              >
                {isCollapsed ? <ExpandMore sx={{ fontSize: 15 }} /> : <ExpandLess sx={{ fontSize: 15 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="View details">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onOpenDetails(initiative); }}
              sx={{ p: 0.3, color: '#cbd5e1', '&:hover': { color: '#6366f1', bgcolor: '#eff6ff' }, borderRadius: 1 }}
            >
              <OpenInNew sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Status pill */}
      <Box display="flex" gap={0.5} mt={1} flexWrap="wrap" alignItems="center">
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.4,
            bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.64rem',
            px: 0.8, py: 0.2, borderRadius: '20px', lineHeight: 1.6,
          }}
        >
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: sc.border, flexShrink: 0 }} />
          {sc.label}
        </Box>
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center',
            bgcolor: `${priorityColor}14`, color: priorityColor, fontWeight: 600, fontSize: '0.64rem',
            px: 0.8, py: 0.2, borderRadius: '20px', lineHeight: 1.6,
          }}
        >
          {initiative.priority.charAt(0) + initiative.priority.slice(1).toLowerCase()}
        </Box>
      </Box>

      {/* Tags */}
      {initiative.tags?.length > 0 && (
        <Box display="flex" gap={0.4} mt={0.75} flexWrap="wrap">
          {initiative.tags.map(tag => (
            <Box
              key={tag}
              sx={{ bgcolor: '#f0f9ff', color: '#0369a1', fontWeight: 500, fontSize: '0.6rem', px: 0.65, py: 0.15, borderRadius: '6px', lineHeight: 1.6 }}
            >
              #{tag}
            </Box>
          ))}
        </Box>
      )}

      {/* Progress bar */}
      {initiative.progress > 0 && (
        <Box mt={1}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.3}>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.6rem', fontWeight: 500 }}>Progress</Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 600 }}>{initiative.progress}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={initiative.progress}
            sx={{
              height: 4, borderRadius: 4, bgcolor: '#f1f5f9',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                background: initiative.progress === 100 ? '#10b981' : 'linear-gradient(90deg, #6366f1, #818cf8)',
              }
            }}
          />
        </Box>
      )}

      {/* Sub-item count */}
      {hasChildren && (
        <Typography sx={{ color: '#94a3b8', fontSize: '0.63rem', fontWeight: 500, mt: 0.75, display: 'block' }}>
          {initiative._count.children} sub-item{initiative._count.children !== 1 ? 's' : ''}
          {isCollapsed ? ' · collapsed' : ''}
        </Typography>
      )}

      {/* Bottom handle + "+" button */}
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
      <Tooltip title="Add sub-item" placement="bottom">
        <IconButton
          className="add-child-tip"
          size="small"
          onClick={(e) => { e.stopPropagation(); onAddChild(initiative.id, initiative.priority); }}
          sx={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%) scale(0.8)',
            opacity: 0,
            transition: 'opacity 0.15s, transform 0.15s',
            width: 24,
            height: 24,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            color: 'white',
            border: '2px solid white',
            boxShadow: '0 3px 10px rgba(99,102,241,0.5)',
            zIndex: 10,
            '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #6366f1)', transform: 'translateX(-50%) scale(1.15)' },
          }}
        >
          <AddCircleOutline sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default memo(MindMapNode);
