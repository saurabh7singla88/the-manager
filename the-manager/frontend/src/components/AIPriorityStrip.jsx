/**
 * Reusable AI priority suggestions strip.
 * Props:
 *   mode        – 'initiatives' | 'tasks'   (default: 'initiatives')
 *   limit       – max suggestions to fetch  (default: 5)
 *   title       – section heading text
 *   onCardClick – (id) => void  — called when a card is clicked
 *   canvasId    – optional canvas filter
 *   sx          – extra Box sx for the outer container
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, IconButton, Skeleton, Tooltip,
} from '@mui/material';
import { AutoAwesome, Refresh, FiberManualRecord, Settings } from '@mui/icons-material';
import api from '../api/axios';
import AISettingsDialog from './AISettingsDialog';

const PROVIDER_BADGE = {
  ollama:            { label: '🦙 Ollama',   color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  openai:            { label: '✨ OpenAI',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  openai_compatible: { label: '🔌 Custom AI', color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
  gemini:            { label: '♊ Gemini',    color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
};

const STATUS_CHIP = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb' },
};

const PRIORITY_COLOR = { CRITICAL: '#dc2626', HIGH: '#d97706', MEDIUM: '#2563eb', LOW: '#64748b' };

export default function AIPriorityStrip({
  mode = 'initiatives',
  limit = 5,
  title,
  onCardClick,
  canvasId,
  sx = {},
}) {
  const [state, setState] = useState({ loading: true, data: null, error: false });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(() => {
    setState(prev => ({ ...prev, loading: true, error: false }));
    api.get('/ai/suggestions', { params: { limit, mode, ...(canvasId ? { canvasId } : {}) } })
      .then(r => setState({ loading: false, data: r.data, error: false }))
      .catch(() => setState({ loading: false, data: null, error: true }));
  }, [mode, limit, canvasId]);

  useEffect(() => { load(); }, [load]);

  const heading = title || (mode === 'tasks' ? '⚡ Task Priorities' : '🧠 AI Priority Suggestions');

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 3,
        background: mode === 'tasks'
          ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
          : 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        border: mode === 'tasks' ? '1px solid #bae6fd' : '1px solid #ddd6fe',
        ...sx,
      }}
    >
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between"
        mb={state.loading || (state.data?.suggestions?.length > 0) ? 2 : 0}>
        <Box display="flex" alignItems="center" gap={1}>
          <AutoAwesome sx={{ fontSize: 16, color: mode === 'tasks' ? '#0369a1' : '#7c3aed' }} />
          <Typography
            variant="subtitle2"
            fontWeight={700}
            color={mode === 'tasks' ? '#075985' : '#5b21b6'}
          >
            {heading}
          </Typography>
          {state.data?.llmUsed && (() => {
            const badge = PROVIDER_BADGE[state.data.llmProvider] || PROVIDER_BADGE.ollama;
            return (
              <Chip
                label={badge.label}
                size="small"
                sx={{ bgcolor: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontWeight: 600, fontSize: '0.62rem', height: 18 }}
              />
            );
          })()}
          {state.data && !state.loading && (
            <Typography variant="caption" color="text.secondary">
              {state.data.analysedCount} item{state.data.analysedCount !== 1 ? 's' : ''} analysed
            </Typography>
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={0.25}>
          <Tooltip title="AI Settings">
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ color: mode === 'tasks' ? '#0369a1' : '#7c3aed' }}
            >
              <Settings fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh suggestions">
            <IconButton
              size="small"
              onClick={load}
              disabled={state.loading}
              sx={{ color: mode === 'tasks' ? '#0369a1' : '#7c3aed' }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Loading skeletons */}
      {state.loading && (
        <Box display="flex" gap={1.5} overflow="hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} variant="rounded" width={200} height={90} sx={{ flexShrink: 0, borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {/* Error */}
      {!state.loading && state.error && (
        <Typography variant="body2" color="text.secondary">Could not load suggestions.</Typography>
      )}

      {/* Empty */}
      {!state.loading && !state.error && state.data?.suggestions?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {mode === 'tasks' ? 'All tasks look on track — nothing urgent.' : 'All items look on track — no urgent items flagged.'}
        </Typography>
      )}

      {/* Cards */}
      {!state.loading && !state.error && state.data?.suggestions?.length > 0 && (
        <Box display="flex" gap={1.5} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {state.data.suggestions.map((item, idx) => {
            const sc = STATUS_CHIP[item.status] || STATUS_CHIP.OPEN;
            const priorityColor = PRIORITY_COLOR[item.priority] || '#64748b';
            const accentColor = mode === 'tasks' ? '#0369a1' : '#7c3aed';
            const accentBorder = mode === 'tasks' ? '#7dd3fc' : '#e9d5ff';
            const accentHoverBorder = mode === 'tasks' ? '#38bdf8' : '#c084fc';
            const accentHoverShadow = mode === 'tasks'
              ? 'rgba(3,105,161,0.12)'
              : 'rgba(124,58,237,0.12)';
            const rankGrad0 = mode === 'tasks'
              ? 'linear-gradient(135deg,#0369a1,#38bdf8)'
              : 'linear-gradient(135deg,#7c3aed,#a78bfa)';
            const rankGrad1 = mode === 'tasks'
              ? 'linear-gradient(135deg,#0284c7,#7dd3fc)'
              : 'linear-gradient(135deg,#2563eb,#60a5fa)';

            return (
              <Box
                key={item.id}
                onClick={() => onCardClick?.(item.id)}
                sx={{
                  flexShrink: 0, width: 210,
                  bgcolor: '#fff',
                  borderRadius: 2.5,
                  border: `1px solid ${accentBorder}`,
                  p: 1.75,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  '&:hover': {
                    boxShadow: `0 4px 16px ${accentHoverShadow}`,
                    borderColor: accentHoverBorder,
                  },
                  display: 'flex', flexDirection: 'column', gap: 0.75,
                }}
              >
                {/* Rank + title */}
                <Box display="flex" alignItems="flex-start" gap={1}>
                  <Box
                    sx={{
                      minWidth: 20, height: 20, borderRadius: '50%', flexShrink: 0, mt: 0.1,
                      background: idx === 0 ? rankGrad0 : idx === 1 ? rankGrad1 : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" fontWeight={700}
                      sx={{ color: idx < 2 ? '#fff' : '#64748b', fontSize: '0.62rem', lineHeight: 1 }}>
                      {idx + 1}
                    </Typography>
                  </Box>
                  <Typography variant="caption" fontWeight={700}
                    sx={{ lineHeight: 1.35, fontSize: '0.75rem' }} noWrap title={item.title}>
                    {item.title}
                  </Typography>
                </Box>

                {/* Status + priority */}
                <Box display="flex" alignItems="center" gap={0.75}>
                  <Chip label={sc.label} size="small"
                    sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.62rem', height: 18, border: 0 }} />
                  <Box display="flex" alignItems="center" gap={0.3}>
                    <FiberManualRecord sx={{ fontSize: 7, color: priorityColor }} />
                    <Typography variant="caption" sx={{ color: priorityColor, fontWeight: 600, fontSize: '0.62rem' }}>
                      {item.priority}
                    </Typography>
                  </Box>
                </Box>

                {/* Top reason */}
                {item.reasons[0] && (
                  <Typography variant="caption"
                    sx={{ color: accentColor, fontSize: '0.68rem', lineHeight: 1.3 }}>
                    {item.reasons[0].icon} {item.reasons[0].label}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer */}
      {!state.loading && !state.error && state.data?.suggestions?.length > 0 && (
        <Typography variant="caption" color="text.secondary"
          sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}>
          Ranked by urgency · priority · due date · staleness
          {state.data?.llmUsed ? ' · description read by LLM' : ''}
        </Typography>
      )}
      <AISettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => load()}
      />
    </Box>
  );
}
