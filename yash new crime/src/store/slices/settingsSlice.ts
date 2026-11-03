import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { SettingsState } from '../../types/state';
import type { UserSettings } from '../../types/entities';

const initialState: SettingsState = {
  userSettings: null,
  systemInfo: null,
  loading: false,
  error: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    updateUserSettingsLocally(state, action: PayloadAction<Partial<UserSettings>>) {
      if (state.userSettings) {
        state.userSettings = { ...state.userSettings, ...action.payload };
      }
    },
    clearSettingsError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(
        action =>
          apiSlice.endpoints.getSettings.matchPending(action) ||
          apiSlice.endpoints.getSystemInfo.matchPending(action) ||
          apiSlice.endpoints.updateSettings.matchPending(action),
        state => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(apiSlice.endpoints.getSettings.matchFulfilled, (state, action) => {
        state.userSettings = {
          userId: '',
          theme: 'light',
          notificationsEnabled: {
            sos: true,
            crime_report: true,
            prediction: true,
            system: true,
            assignment: true,
          },
          refreshInterval: 30,
          defaultPageSize: 25,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getSystemInfo.matchFulfilled, (state, action) => {
        state.systemInfo = action.payload;
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.updateSettings.matchFulfilled, (state, action) => {
        state.loading = false;
      })
      .addMatcher(
        action =>
          apiSlice.endpoints.getSettings.matchRejected(action) ||
          apiSlice.endpoints.getSystemInfo.matchRejected(action) ||
          apiSlice.endpoints.updateSettings.matchRejected(action),
        (state, action) => {
          state.loading = false;
          state.error = action.error.message ?? 'Failed to load settings';
        }
      );
  },
});

export const { clearSettingsError, updateUserSettingsLocally } = settingsSlice.actions;

export const selectSettingsState = (state: RootState) => state.settings;
export const selectUserSettings = createSelector(selectSettingsState, s => s.userSettings);
export const selectSystemInfo = createSelector(selectSettingsState, s => s.systemInfo);
export const selectSettingsLoading = createSelector(selectSettingsState, s => s.loading);
export const selectSettingsError = createSelector(selectSettingsState, s => s.error);

export default settingsSlice.reducer;
