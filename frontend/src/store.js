import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/auth/authSlice';
import initiativesReducer from './features/initiatives/initiativesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    initiatives: initiativesReducer
  }
});
