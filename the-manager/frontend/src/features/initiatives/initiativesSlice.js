import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/axios';

// Async thunks
export const fetchInitiatives = createAsyncThunk(
  'initiatives/fetchAll',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.parentId !== undefined) params.append('parentId', filters.parentId);
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/initiatives?${params}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch initiatives');
    }
  }
);

export const fetchInitiativeById = createAsyncThunk(
  'initiatives/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/initiatives/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch initiative');
    }
  }
);

export const createInitiative = createAsyncThunk(
  'initiatives/create',
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post('/initiatives', data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to create initiative');
    }
  }
);

export const updateInitiative = createAsyncThunk(
  'initiatives/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/initiatives/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update initiative');
    }
  }
);

export const deleteInitiative = createAsyncThunk(
  'initiatives/delete',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/initiatives/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to delete initiative');
    }
  }
);

export const updateStatus = createAsyncThunk(
  'initiatives/updateStatus',
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/initiatives/${id}/status`, { status });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update status');
    }
  }
);

export const updatePriority = createAsyncThunk(
  'initiatives/updatePriority',
  async ({ id, priority }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/initiatives/${id}/priority`, { priority });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update priority');
    }
  }
);

export const fetchAllInitiatives = createAsyncThunk(
  'initiatives/fetchAll_flat',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/initiatives');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch initiatives');
    }
  }
);

export const updatePosition = createAsyncThunk(
  'initiatives/updatePosition',
  async ({ id, positionX, positionY }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/initiatives/${id}/position`, { positionX, positionY });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update position');
    }
  }
);

const initialState = {
  items: [],
  allItems: [],
  selectedInitiative: null,
  loading: false,
  allItemsLoading: false,
  error: null,
  filters: {
    status: '',
    priority: '',
    search: ''
  }
};

const initiativesSlice = createSlice({
  name: 'initiatives',
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearSelectedInitiative: (state) => {
      state.selectedInitiative = null;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchInitiatives.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInitiatives.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchInitiatives.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch by ID
      .addCase(fetchInitiativeById.fulfilled, (state, action) => {
        state.selectedInitiative = action.payload;
      })
      // Create
      .addCase(createInitiative.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      // Update
      .addCase(updateInitiative.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedInitiative?.id === action.payload.id) {
          state.selectedInitiative = action.payload;
        }
      })
      // Delete
      .addCase(deleteInitiative.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload);
        if (state.selectedInitiative?.id === action.payload) {
          state.selectedInitiative = null;
        }
      })
      // Update status
      .addCase(updateStatus.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      // Update priority
      .addCase(updatePriority.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      // Fetch all (flat, for mind map)
      .addCase(fetchAllInitiatives.pending, (state) => {
        state.allItemsLoading = true;
      })
      .addCase(fetchAllInitiatives.fulfilled, (state, action) => {
        state.allItemsLoading = false;
        state.allItems = action.payload;
      })
      .addCase(fetchAllInitiatives.rejected, (state) => {
        state.allItemsLoading = false;
      })
      // Update position
      .addCase(updatePosition.fulfilled, (state, action) => {
        const index = state.allItems.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.allItems[index] = { ...state.allItems[index], positionX: action.payload.positionX, positionY: action.payload.positionY };
        }
      });
  }
});

export const { setFilters, clearSelectedInitiative, clearError } = initiativesSlice.actions;
export default initiativesSlice.reducer;
