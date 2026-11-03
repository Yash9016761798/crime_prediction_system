import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { AnalyticsState } from '../../types/state';

const initialState: AnalyticsState = {
  filters: {
    dateFrom: '',
    dateTo: '',
    district: '',
    crimeType: '',
  },
  trends: [],
  districtComparison: [],
  seasonalPatterns: [],
  hotspots: [],
  loading: false,
  error: null,
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    setAnalyticsFilters(state, action: PayloadAction<Partial<AnalyticsState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearAnalyticsFilters(state) {
      state.filters = initialState.filters;
    },
    clearAnalyticsError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(
        action =>
          apiSlice.endpoints.getCrimeTrends.matchPending(action) ||
          apiSlice.endpoints.getDistrictComparison.matchPending(action) ||
          apiSlice.endpoints.getSeasonalPatterns.matchPending(action) ||
          apiSlice.endpoints.getHotspots.matchPending(action) ||
          apiSlice.endpoints.getCombinedAnalytics.matchPending(action),
        state => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(apiSlice.endpoints.getCrimeTrends.matchFulfilled, (state, action) => {
        state.trends = action.payload.trends;
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getDistrictComparison.matchFulfilled, (state, action) => {
        state.districtComparison = action.payload.districts;
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getSeasonalPatterns.matchFulfilled, (state, action) => {
        state.seasonalPatterns = action.payload.monthly.map(m => ({
          month: m.month,
          averageCount: m.averageCount,
          years: m.years,
        }));
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getHotspots.matchFulfilled, (state, action) => {
        state.hotspots = action.payload.hotspots;
        state.loading = false;
      })
      .addMatcher(
        action =>
          apiSlice.endpoints.getCrimeTrends.matchRejected(action) ||
          apiSlice.endpoints.getDistrictComparison.matchRejected(action) ||
          apiSlice.endpoints.getSeasonalPatterns.matchRejected(action) ||
          apiSlice.endpoints.getHotspots.matchRejected(action) ||
          apiSlice.endpoints.getCombinedAnalytics.matchRejected(action),
        (state, action) => {
          state.loading = false;
          state.error = action.error.message ?? 'Failed to load analytics data';
        }
      );
  },
});

export const { clearAnalyticsError, clearAnalyticsFilters, setAnalyticsFilters } = analyticsSlice.actions;

export const selectAnalyticsState = (state: RootState) => state.analytics;
export const selectAnalyticsFilters = createSelector(selectAnalyticsState, a => a.filters);
export const selectAnalyticsTrends = createSelector(selectAnalyticsState, a => a.trends);
export const selectAnalyticsDistrictComparison = createSelector(selectAnalyticsState, a => a.districtComparison);
export const selectAnalyticsSeasonalPatterns = createSelector(selectAnalyticsState, a => a.seasonalPatterns);
export const selectAnalyticsHotspots = createSelector(selectAnalyticsState, a => a.hotspots);
export const selectAnalyticsLoading = createSelector(selectAnalyticsState, a => a.loading);
export const selectAnalyticsError = createSelector(selectAnalyticsState, a => a.error);

export default analyticsSlice.reducer;
