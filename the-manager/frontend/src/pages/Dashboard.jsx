import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Typography, Grid, Box, Button, Chip, LinearProgress, Divider,
} from '@mui/material';
import {
  Add, CheckCircleOutline, AccessTime, Block, TrendingUp,
  ChevronRight, AccountTree, TaskAlt,
} from '@mui/icons-material';
import { fetchAllInitiatives } from '../features/initiatives/initiativesSlice';
import { useNavigate } from 'react-router-dom';
import AIPriorityStrip from '../components/AIPriorityStrip';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: '#f0fdf4' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f9fafb' },
};
const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2' },
  HIGH:     { color: '#d97706', bg: '#fffbeb' },
  MEDIUM:   { color: '#2563eb', bg: '#eff6ff' },
  LOW:      { color: '#64748b', bg: '#f1f5f9' },
};

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allItems } = useSelector((state) => state.initiatives);

  useEffect(() => { dispatch(fetchAllInitiatives()); }, [dispatch]);

  // Segregate root vs sub-items
  const rootItems = allItems.filter(i => !i.parentId);
  const subItems  = allItems.filter(i =>  i.parentId);

  const rootStats = {
    total:      rootItems.length,
    inProgress: rootItems.filter(i => i.status === 'IN_PROGRESS').length,
    blocked:    rootItems.filter(i => i.status === 'BLOCKED').length,
    completed:  rootItems.filter(i => i.status === 'COMPLETED').length,
  };

  const subStats = {
    total:      subItems.length,
    inProgress: subItems.filter(i => i.status === 'IN_PROGRESS').length,
    blocked:    subItems.filter(i => i.status === 'BLOCKED').length,
    completed:  subItems.filter(i => i.status === 'COMPLETED').length,
  };

  const completionRate = rootStats.total > 0
    ? Math.round((rootStats.completed / rootStats.total) * 100)
    : 0;

  const topLevelStatCards = [
    { label: 'Initiatives', value: rootStats.total,      icon: <TrendingUp />,        gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
    { label: 'In Progress', value: rootStats.inProgress, icon: <AccessTime />,         gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
    { label: 'Blocked',     value: rootStats.blocked,    icon: <Block />,              gradient: 'linear-gradient(135deg, #ef4444, #f87171)' },
    { label: 'Completed',   value: rootStats.completed,  icon: <CheckCircleOutline />, gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  ];

  // Recent list: root items only, sorted by most recently updated
  const recentRoots = [...rootItems]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 8);

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Dashboard</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/initiatives')} sx={{ mt: 0.5 }}>
          New Initiative
        </Button>
      </Box>

      {/* ── AI Prioritization Suggestions ── */}
      <AIPriorityStrip
        mode="initiatives"
        limit={5}
        title="AI Priority Suggestions"
        onCardClick={id => navigate(`/initiatives?open=${id}`)}
        sx={{ mb: 3 }}
      />

      {/* ── AI Task Priorities ── */}
      <AIPriorityStrip
        mode="tasks"
        limit={5}
        title="Task Priorities"
        onCardClick={id => navigate(`/tasks?open=${id}`)}
        sx={{ mb: 4 }}
      />

      {/* ── Top-level initiative stat cards ── */}
      <Box mb={1}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <AccountTree sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Top-level Initiatives
          </Typography>
        </Box>
        <Grid container spacing={2.5}>
          {topLevelStatCards.map((card) => (
            <Grid item xs={6} md={3} key={card.label}>
              <Box
                sx={{
                  borderRadius: 3, p: 2.5, background: card.gradient, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 500 }}>{card.label}</Typography>
                  <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1.1, mt: 0.25 }}>{card.value}</Typography>
                </Box>
                <Box sx={{ opacity: 0.7, '& svg': { fontSize: 36 } }}>{card.icon}</Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Sub-items summary strip ── */}
      <Box
        sx={{
          mt: 2.5, mb: 4, px: 3, py: 2,
          bgcolor: 'background.paper',
          border: '1px solid #e2e8f0',
          borderRadius: 3,
          display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <TaskAlt sx={{ fontSize: 16, color: '#6366f1' }} />
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Sub-items &amp; Tasks
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        {[
          { label: 'Total',       value: subStats.total,      color: '#64748b' },
          { label: 'In Progress', value: subStats.inProgress, color: '#2563eb' },
          { label: 'Blocked',     value: subStats.blocked,    color: '#dc2626' },
          { label: 'Completed',   value: subStats.completed,  color: '#059669' },
        ].map((s, idx) => (
          <Box key={s.label} display="flex" alignItems="center" gap={1.5}>
            {idx > 0 && <Divider orientation="vertical" flexItem />}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: s.color, lineHeight: 1 }}>{s.value}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ── Bottom row: progress breakdown + recent initiatives ── */}
      <Grid container spacing={3}>
        {/* Progress breakdown (root items only) */}
        <Grid item xs={12} md={4}>
          <Box
            sx={{
              bgcolor: 'background.paper', borderRadius: 3,
              border: '1px solid #e2e8f0', p: 3, height: '100%',
            }}
          >
            <Typography variant="h6" mb={0.5}>Initiative Progress</Typography>
            <Typography variant="caption" color="text.secondary">Top-level initiatives only</Typography>
            <Box display="flex" alignItems="flex-end" gap={1} mb={1.5} mt={2}>
              <Typography variant="h2" fontWeight={700} color="primary">{completionRate}%</Typography>
              <Typography variant="body2" color="text.secondary" mb={0.75}>complete</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={completionRate}
              sx={{ height: 8, borderRadius: 4, mb: 3 }}
              color="success"
            />
            <Divider sx={{ mb: 2 }} />
            {[
              { label: 'Open',        value: rootItems.filter(i => i.status === 'OPEN').length,     color: '#64748b' },
              { label: 'In Progress', value: rootStats.inProgress,                                  color: '#3b82f6' },
              { label: 'On Hold',     value: rootItems.filter(i => i.status === 'ON_HOLD').length,  color: '#f59e0b' },
              { label: 'Blocked',     value: rootStats.blocked,                                     color: '#ef4444' },
              { label: 'Completed',   value: rootStats.completed,                                   color: '#10b981' },
            ].map(row => (
              <Box key={row.label} display="flex" justifyContent="space-between" alignItems="center" mb={1.25}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.color, flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                </Box>
                <Typography variant="body2" fontWeight={600}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
        </Grid>

        {/* Recent top-level initiatives */}
        <Grid item xs={12} md={8}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" px={3} py={2.25}>
              <Box>
                <Typography variant="h6">Recent Initiatives</Typography>
                <Typography variant="caption" color="text.secondary">Top-level only · sub-item counts shown</Typography>
              </Box>
              <Button size="small" endIcon={<ChevronRight />} onClick={() => navigate('/initiatives')} sx={{ color: 'primary.main' }}>
                View all
              </Button>
            </Box>
            <Divider />
            {recentRoots.length === 0 ? (
              <Box px={3} py={5} textAlign="center">
                <Typography color="text.secondary" mb={2}>No initiatives yet.</Typography>
                <Button variant="contained" size="small" startIcon={<Add />} onClick={() => navigate('/initiatives')}>
                  Create First
                </Button>
              </Box>
            ) : (
              recentRoots.map((item, idx) => {
                const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN;
                const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.MEDIUM;
                // Count sub-items for this root from allItems
                const childCount = allItems.filter(i => i.parentId === item.id).length
                  || item._count?.children
                  || 0;
                return (
                  <Box
                    key={item.id}
                    sx={{
                      px: 3, py: 1.75,
                      borderBottom: idx < recentRoots.length - 1 ? '1px solid #f1f5f9' : 0,
                      display: 'flex', alignItems: 'center', gap: 2,
                      '&:hover': { bgcolor: '#fafbff' },
                      transition: 'background 0.15s',
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{item.title}</Typography>
                      {item.description && (
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                    <Box display="flex" gap={0.75} alignItems="center" flexShrink={0}>
                      {childCount > 0 && (
                        <Chip
                          label={`${childCount} sub`}
                          size="small"
                          sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 500, border: 0, fontSize: '0.68rem' }}
                        />
                      )}
                      <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 500, border: 0 }} />
                      <Chip label={item.priority} size="small" sx={{ bgcolor: pc.bg, color: pc.color, fontWeight: 500, border: 0 }} />
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

