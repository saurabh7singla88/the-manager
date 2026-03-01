import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography, Chip, LinearProgress, IconButton, Tooltip } from '@mui/material';
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

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: 'white',
        border: `1.5px solid ${selected ? '#6366f1' : sc.border}`,
        borderLeft: `4px solid ${PRIORITY_COLORS[initiative.priority] || '#94a3b8'}`,
        borderRadius: '10px',
        p: 1.5,
        minWidth: 190,
        maxWidth: 230,
        boxShadow: selected
          ? '0 0 0 3px rgba(99,102,241,0.2), 0 4px 12px rgba(0,0,0,0.12)'
          : '0 2px 8px rgba(0,0,0,0.08)',
        userSelect: 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
          borderColor: selected ? '#6366f1' : '#6366f1',
        },
        '&:hover .add-child-tip': { opacity: 1, transform: 'translateX(-50%) scale(1)' },
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />

      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={0.5}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ wordBreak: 'break-word', flex: 1, lineHeight: 1.35, fontSize: '0.82rem' }}
        >
          {initiative.title}
        </Typography>
        <Box display="flex" alignItems="center" sx={{ flexShrink: 0, mt: -0.25 }}>
          {hasChildren && (
            <Tooltip title={isCollapsed ? 'Expand' : 'Collapse'}>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(initiative.id); }}
                sx={{ p: 0.25, color: 'text.secondary' }}
              >
                {isCollapsed ? <ExpandMore sx={{ fontSize: 15 }} /> : <ExpandLess sx={{ fontSize: 15 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="View details">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onOpenDetails(initiative); }}
              sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: '#6366f1' } }}
            >
              <OpenInNew sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Status + Priority badges */}
      <Box display="flex" gap={0.5} mt={0.75} flexWrap="wrap">
        <Chip
          size="small"
          label={sc.label}
          sx={{
            bgcolor: sc.bg,
            color: sc.color,
            fontWeight: 600,
            fontSize: '0.62rem',
            height: 18,
            border: 0,
          }}
        />
        <Chip
          size="small"
          label={initiative.priority.charAt(0) + initiative.priority.slice(1).toLowerCase()}
          sx={{
            bgcolor: `${PRIORITY_COLORS[initiative.priority]}18`,
            color: PRIORITY_COLORS[initiative.priority],
            fontWeight: 600,
            fontSize: '0.62rem',
            height: 18,
            border: 0,
          }}
        />
      </Box>

      {/* Tags */}
      {initiative.tags?.length > 0 && (
        <Box display="flex" gap={0.4} mt={0.6} flexWrap="wrap">
          {initiative.tags.map(tag => (
            <Box
              key={tag}
              sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '0.58rem', px: 0.6, py: 0.1, borderRadius: 1, lineHeight: 1.6 }}
            >
              #{tag}
            </Box>
          ))}
        </Box>
      )}

      {/* Progress */}
      {initiative.progress > 0 && (
        <Box mt={0.75}>
          <LinearProgress
            variant="determinate"
            value={initiative.progress}
            sx={{ height: 3, borderRadius: 2, bgcolor: '#e2e8f0' }}
            color={initiative.progress === 100 ? 'success' : 'primary'}
          />
          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
            {initiative.progress}%
          </Typography>
        </Box>
      )}

      {/* Sub-item count */}
      {hasChildren && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }} display="block" mt={0.4}>
          {initiative._count.children} sub-item{initiative._count.children !== 1 ? 's' : ''}
          {isCollapsed ? ' · collapsed' : ''}
        </Typography>
      )}

      {/* Bottom handle + centered "+" tip button */}
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
      <Tooltip title="Add sub-item" placement="bottom">
        <IconButton
          className="add-child-tip"
          size="small"
          onClick={(e) => { e.stopPropagation(); onAddChild(initiative.id, initiative.priority); }}
          sx={{
            position: 'absolute',
            bottom: -13,
            left: '50%',
            transform: 'translateX(-50%) scale(0.85)',
            opacity: 0,
            transition: 'opacity 0.15s, transform 0.15s',
            width: 22,
            height: 22,
            bgcolor: '#6366f1',
            color: 'white',
            border: '2px solid white',
            boxShadow: '0 2px 6px rgba(99,102,241,0.45)',
            zIndex: 10,
            '&:hover': { bgcolor: '#4f46e5', transform: 'translateX(-50%) scale(1.1)' },
          }}
        >
          <AddCircleOutline sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default memo(MindMapNode);
