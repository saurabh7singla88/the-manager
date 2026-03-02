import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/axios';

export const fetchCanvases = createAsyncThunk(
  'canvas/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/canvases');
      return res.data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.error || 'Failed to fetch canvases');
    }
  }
);

export const createCanvas = createAsyncThunk(
  'canvas/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await api.post('/canvases', data);
      return res.data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.error || 'Failed to create canvas');
    }
  }
);

export const updateCanvas = createAsyncThunk(
  'canvas/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await api.put(`/canvases/${id}`, data);
      return res.data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.error || 'Failed to update canvas');
    }
  }
);

export const deleteCanvas = createAsyncThunk(
  'canvas/delete',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/canvases/${id}`);
      return id;
    } catch (e) {
      return rejectWithValue(e.response?.data?.error || 'Failed to delete canvas');
    }
  }
);

const canvasSlice = createSlice({
  name: 'canvas',
  initialState: {
    canvases: [],
    // Per-screen active canvas — changing one screen never affects another
    activeCanvasId: {
      initiatives: null,
      mindmap: null,
      tasks: null,
    },
    loading: false,
    error: null,
  },
  reducers: {
    setActiveCanvas(state, action) {
      const { screen, canvasId } = action.payload;
      state.activeCanvasId[screen] = canvasId;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCanvases.pending, (state) => { state.loading = true; })
      .addCase(fetchCanvases.fulfilled, (state, action) => {
        state.loading = false;
        state.canvases = action.payload;
      })
      .addCase(fetchCanvases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createCanvas.fulfilled, (state, action) => {
        state.canvases.push(action.payload);
        // auto-switch is handled in CanvasSelector (per screen)
      })
      .addCase(updateCanvas.fulfilled, (state, action) => {
        const idx = state.canvases.findIndex(c => c.id === action.payload.id);
        if (idx !== -1) state.canvases[idx] = action.payload;
      })
      .addCase(deleteCanvas.fulfilled, (state, action) => {
        state.canvases = state.canvases.filter(c => c.id !== action.payload);
        // Reset any screen that had the deleted canvas active
        Object.keys(state.activeCanvasId).forEach(screen => {
          if (state.activeCanvasId[screen] === action.payload)
            state.activeCanvasId[screen] = null;
        });
      });
  }
});

export const { setActiveCanvas } = canvasSlice.actions;
export default canvasSlice.reducer;
