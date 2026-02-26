import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Grid, Card, CardContent, Box, Button } from '@mui/material';
import { Add, CheckCircle, Schedule, Block, TrendingUp } from '@mui/icons-material';
import { fetchInitiatives } from '../features/initiatives/initiativesSlice';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items } = useSelector((state) => state.initiatives);

  useEffect(() => {
    dispatch(fetchInitiatives());
  }, [dispatch]);

  const stats = {
    total: items.length,
    open: items.filter(i => i.status === 'OPEN').length,
    inProgress: items.filter(i => i.status === 'IN_PROGRESS').length,
    blocked: items.filter(i => i.status === 'BLOCKED').length,
    completed: items.filter(i => i.status === 'COMPLETED').length
  };

  const StatCard = ({ title, value, icon, color }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4">
              {value}
            </Typography>
          </Box>
          <Box sx={{ color, opacity: 0.8 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4">Dashboard</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/initiatives')}
        >
          New Initiative
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Initiatives"
            value={stats.total}
            icon={<TrendingUp sx={{ fontSize: 40 }} />}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="In Progress"
            value={stats.inProgress}
            icon={<Schedule sx={{ fontSize: 40 }} />}
            color="info.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Blocked"
            value={stats.blocked}
            icon={<Block sx={{ fontSize: 40 }} />}
            color="error.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={stats.completed}
            icon={<CheckCircle sx={{ fontSize: 40 }} />}
            color="success.main"
          />
        </Grid>
      </Grid>

      <Box mt={4}>
        <Typography variant="h5" gutterBottom>Recent Initiatives</Typography>
        {items.slice(0, 5).map((initiative) => (
          <Card key={initiative.id} sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">{initiative.title}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    {initiative.description || 'No description'}
                  </Typography>
                </Box>
                <Box display="flex" gap={1} alignItems="center">
                  <Box
                    sx={{
                      px: 2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: initiative.status === 'COMPLETED' ? 'success.light' :
                               initiative.status === 'BLOCKED' ? 'error.light' :
                               initiative.status === 'IN_PROGRESS' ? 'info.light' : 'grey.300',
                      color: 'white',
                      fontSize: '0.75rem'
                    }}
                  >
                    {initiative.status.replace('_', ' ')}
                  </Box>
                  <Box
                    sx={{
                      px: 2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: initiative.priority === 'CRITICAL' ? 'error.main' :
                               initiative.priority === 'HIGH' ? 'warning.main' :
                               initiative.priority === 'MEDIUM' ? 'info.main' : 'grey.500',
                      color: 'white',
                      fontSize: '0.75rem'
                    }}
                  >
                    {initiative.priority}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
