import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { LoginResponse } from '../../types/api';
import type { AuthState } from '../../types/state';
import type { User } from '../../types/entities';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

function applyCredentials(state: AuthState, payload: LoginResponse) {
  state.user = payload.user;
  state.accessToken = payload.accessToken;
  state.refreshToken = payload.refreshToken;
  state.isAuthenticated = true;
  state.loading = false;
  state.error = null;
}

/** Pulls the human-readable message the API returns in the error body. */
function extractErrorMessage(error: { data?: unknown; message?: string }): string {
  const body = error.data as { message?: string; error?: string } | undefined;
  return body?.message || body?.error || error.message || 'Request failed. Please try again.';
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<LoginResponse>) {
      applyCredentials(state, action.payload);
    },
    setCurrentUser(state, action: PayloadAction<User | null>) {
      state.user = action.payload;
      state.isAuthenticated = Boolean(action.payload && state.accessToken);
    },
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
    clearAuthError(state) {
      state.error = null;
    },
    logoutLocally() {
      return initialState;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.login.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.login.matchFulfilled, (state, action) => {
        applyCredentials(state, action.payload);
      })
      .addMatcher(apiSlice.endpoints.login.matchRejected, (state, action) => {
        state.loading = false;
        state.error = extractErrorMessage(action.error);
      })
      .addMatcher(apiSlice.endpoints.register.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.register.matchFulfilled, (state, action) => {
        applyCredentials(state, action.payload);
      })
      .addMatcher(apiSlice.endpoints.register.matchRejected, (state, action) => {
        state.loading = false;
        state.error = extractErrorMessage(action.error);
      })
      .addMatcher(apiSlice.endpoints.refreshSession.matchFulfilled, (state, action) => {
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.isAuthenticated = Boolean(action.payload.accessToken && state.user);
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.getCurrentUser.matchFulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = Boolean(action.payload && state.accessToken);
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.logout.matchFulfilled, () => initialState);
  },
});

export const {
  clearAuthError,
  logoutLocally,
  setAuthError,
  setAuthLoading,
  setCredentials,
  setCurrentUser,
} = authSlice.actions;

export const selectAuthState = (state: RootState) => state.auth;
export const selectCurrentUser = createSelector(selectAuthState, auth => auth.user);
export const selectAccessToken = createSelector(
  selectAuthState,
  auth => auth.accessToken
);
export const selectIsAuthenticated = createSelector(
  selectAuthState,
  auth => auth.isAuthenticated
);
export const selectAuthLoading = createSelector(selectAuthState, auth => auth.loading);
export const selectAuthError = createSelector(selectAuthState, auth => auth.error);

export default authSlice.reducer;
