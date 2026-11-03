import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { apiSlice } from './api';

import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import uiReducer from './slices/uiSlice';
import firReducer from './slices/firSlice';
import caseReducer from './slices/caseSlice';
import userReducer from './slices/userSlice';
import officerReducer from './slices/officerSlice';
import crimeReportReducer from './slices/crimeReportSlice';
import sosAlertReducer from './slices/sosAlertSlice';
import notificationReducer from './slices/notificationSlice';
import analyticsReducer from './slices/analyticsSlice';
import predictionsReducer from './slices/predictionsSlice';
import settingsReducer from './slices/settingsSlice';

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  whitelist: ['auth', 'ui', 'settings'],
};

const rootReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  ui: uiReducer,
  firs: firReducer,
  cases: caseReducer,
  users: userReducer,
  officers: officerReducer,
  crimeReports: crimeReportReducer,
  sosAlerts: sosAlertReducer,
  notifications: notificationReducer,
  analytics: analyticsReducer,
  predictions: predictionsReducer,
  settings: settingsReducer,
  [apiSlice.reducerPath]: apiSlice.reducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(apiSlice.middleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
