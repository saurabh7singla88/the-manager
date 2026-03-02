import { Outlet } from 'react-router-dom';
import {
  Box, Typography, Button, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, IconButton,
  Avatar, Divider, Tooltip, AppBar, Toolbar, Container
} from '@mui/material';
import { Dashboard as DashboardIcon, List as ListIcon, Logout, Menu as MenuIcon, AccountTree, CheckBox as TasksIcon, People as PeopleIcon } from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';
import { useState } from 'react';

const drawerWidth = 220;
const SIDEBAR_BG = '#1e1b4b';
const SIDEBAR_HOVER = 'rgba(255,255,255,0.07)';
const SIDEBAR_ACTIVE = 'rgba(99,102,241,0.22)';
const SIDEBAR_TEXT = 'rgba(255,255,255,0.75)';
const SIDEBAR_ACTIVE_TEXT = '#a5b4fc';

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon fontSize="small" />, path: '/' },
    { text: 'Initiatives', icon: <ListIcon fontSize="small" />, path: '/initiatives' },
    { text: 'Mind Map', icon: <AccountTree fontSize="small" />, path: '/mindmap' },
    { text: 'Tasks', icon: <TasksIcon fontSize="small" />, path: '/tasks' },
    { text: 'Users', icon: <PeopleIcon fontSize="small" />, path: '/users' },
  ];

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_BG }}>
      {/* Logo */}
      <Box sx={{ px: 2.5, py: 3 }}>
        <Box display="flex" alignItems="center" gap={1.25}>
          <Box
            sx={{
              width: 32, height: 32, borderRadius: 2,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AccountTree sx={{ color: '#fff', fontSize: 18 }} />
          </Box>
          <Typography
            variant="body1"
            fontWeight={700}
            sx={{ color: '#ffffff', letterSpacing: '-0.01em' }}
          >
            The Manager
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 2 }} />

      {/* Nav items */}
      <List sx={{ flex: 1, pt: 1.5, px: 0 }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  width: 'auto',
                  mb: 0.25,
                  py: 1,
                  bgcolor: active ? SIDEBAR_ACTIVE : 'transparent',
                  color: active ? SIDEBAR_ACTIVE_TEXT : SIDEBAR_TEXT,
                  '&:hover': { bgcolor: active ? SIDEBAR_ACTIVE : SIDEBAR_HOVER, color: '#ffffff' },
                  '& .MuiListItemIcon-root': { color: active ? SIDEBAR_ACTIVE_TEXT : SIDEBAR_TEXT },
                  '&:hover .MuiListItemIcon-root': { color: '#ffffff' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: 2 }} />

      {/* User footer */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          sx={{
            width: 32, height: 32, fontSize: '0.75rem', fontWeight: 600,
            bgcolor: '#4f46e5', color: '#fff', flexShrink: 0,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={600} sx={{ color: '#ffffff', display: 'block' }} noWrap>
            {user?.name}
          </Typography>
          <Typography variant="caption" sx={{ color: SIDEBAR_TEXT, fontSize: '0.7rem' }} noWrap>
            {user?.email}
          </Typography>
        </Box>
        <Tooltip title="Logout">
          <IconButton size="small" onClick={handleLogout} sx={{ color: SIDEBAR_TEXT, '&:hover': { color: '#ef4444' } }}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Mobile AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { sm: 'none' },
          bgcolor: SIDEBAR_BG,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>The Manager</Typography>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: drawerWidth, bgcolor: SIDEBAR_BG },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { width: drawerWidth, bgcolor: SIDEBAR_BG, border: 0 },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3.5 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 8, sm: 0 },
          minHeight: '100vh',
        }}
      >
        <Container maxWidth="xl" disableGutters>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
