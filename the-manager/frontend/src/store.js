import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/auth/authSlice';
import initiativesReducer from './features/initiatives/initiativesSlice';
import canvasReducer from './features/canvas/canvasSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    initiatives: initiativesReducer,
    canvas: canvasReducer,
  }
});
