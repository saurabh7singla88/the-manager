import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, Paper, InputAdornment, IconButton, CircularProgress
} from '@mui/material';
import { Email, Lock, Visibility, VisibilityOff, AccountTree } from '@mui/icons-material';
import { login } from '../features/auth/authSlice';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(login(formData));
    if (login.fulfilled.match(result)) navigate('/');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: '#f8fafc',
      }}
    >
      {/* Left panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: 1,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 60%, #818cf8 100%)',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 6,
          color: '#fff',
        }}
      >
        <Box sx={{ maxWidth: 360, textAlign: 'center' }}>
          <Box
            sx={{
              width: 56, height: 56, borderRadius: 3,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mx: 'auto', mb: 3,
            }}
          >
            <AccountTree sx={{ fontSize: 30, color: '#fff' }} />
          </Box>
          <Typography variant="h3" fontWeight={700} gutterBottom>
            The Manager
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.8, lineHeight: 1.7 }}>
            Track strategic initiatives, manage priorities, and visualise your work — all in one place.
          </Typography>
        </Box>
      </Box>

      {/* Right panel */}
      <Box
        sx={{
          flex: { xs: 1, md: '0 0 460px' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 5 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Typography variant="h4" fontWeight={700} mb={0.75}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3.5}>
            Sign in to your account to continue
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Email sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              required
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.4 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Sign in'}
            </Button>
          </form>

          <Typography variant="body2" color="text.secondary" textAlign="center" mt={3}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#6366f1', fontWeight: 500 }}>Create one</Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

