import { createSelector, createSlice } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { DashboardState } from '../../types/state';

const initialState: DashboardState = {
  statistics: null,
  recentCrimes: [],
  districtAnalysis: [],
  crimeTypeBreakdown: [],
  trends: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboardError(state) {
      state.error = null;
    },
    resetDashboardState() {
      return initialState;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(
        action =>
          apiSlice.endpoints.getDashboardStatistics.matchPending(action) ||
          apiSlice.endpoints.getDashboardRecentCrimes.matchPending(action) ||
          apiSlice.endpoints.getDashboardDistrictAnalysis.matchPending(action) ||
          apiSlice.endpoints.getDashboardCrimeTypeBreakdown.matchPending(action) ||
          apiSlice.endpoints.getDashboardTrends.matchPending(action),
        state => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(apiSlice.endpoints.getDashboardStatistics.matchFulfilled, (state, action) => {
        state.statistics = action.payload;
        state.loading = false;
        state.lastUpdated = new Date();
      })
      .addMatcher(apiSlice.endpoints.getDashboardRecentCrimes.matchFulfilled, (state, action) => {
        state.recentCrimes = action.payload;
        state.loading = false;
        state.lastUpdated = new Date();
      })
      .addMatcher(apiSlice.endpoints.getDashboardDistrictAnalysis.matchFulfilled, (state, action) => {
        state.districtAnalysis = action.payload;
        state.loading = false;
        state.lastUpdated = new Date();
      })
      .addMatcher(apiSlice.endpoints.getDashboardCrimeTypeBreakdown.matchFulfilled, (state, action) => {
        state.crimeTypeBreakdown = action.payload;
        state.loading = false;
        state.lastUpdated = new Date();
      })
      .addMatcher(apiSlice.endpoints.getDashboardTrends.matchFulfilled, (state, action) => {
        state.trends = action.payload;
        state.loading = false;
        state.lastUpdated = new Date();
      })
      .addMatcher(
        action =>
          apiSlice.endpoints.getDashboardStatistics.matchRejected(action) ||
          apiSlice.endpoints.getDashboardRecentCrimes.matchRejected(action) ||
          apiSlice.endpoints.getDashboardDistrictAnalysis.matchRejected(action) ||
          apiSlice.endpoints.getDashboardCrimeTypeBreakdown.matchRejected(action) ||
          apiSlice.endpoints.getDashboardTrends.matchRejected(action),
        (state, action) => {
          state.loading = false;
          state.error = action.error.message ?? 'Unable to load dashboard data.';
        }
      );
  },
});

export const { clearDashboardError, resetDashboardState } = dashboardSlice.actions;

export const selectDashboardState = (state: RootState) => state.dashboard;
export const selectDashboardStatistics = createSelector(
  selectDashboardState,
  dashboard => dashboard.statistics
);
export const selectDashboardRecentCrimes = createSelector(
  selectDashboardState,
  dashboard => dashboard.recentCrimes
);
export const selectDashboardDistrictAnalysis = createSelector(
  selectDashboardState,
  dashboard => dashboard.districtAnalysis
);
export const selectDashboardCrimeTypeBreakdown = createSelector(
  selectDashboardState,
  dashboard => dashboard.crimeTypeBreakdown
);
export const selectDashboardTrends = createSelector(
  selectDashboardState,
  dashboard => dashboard.trends
);
export const selectDashboardLoading = createSelector(
  selectDashboardState,
  dashboard => dashboard.loading
);
export const selectDashboardLastUpdated = createSelector(
  selectDashboardState,
  dashboard => dashboard.lastUpdated
);
export const selectDashboardInsightCards = createSelector(
  selectDashboardStatistics,
  statistics => {
    if (!statistics) {
      return [];
    }

    return [
      { id: 'firs', label: 'Total FIRs', value: statistics.totalFIRs },
      { id: 'cases', label: 'Active Cases', value: statistics.activeCases },
      { id: 'reports', label: 'Pending Reports', value: statistics.pendingReports },
      { id: 'officers', label: 'Active Officers', value: statistics.activeOfficers },
      { id: 'sos', label: 'SOS Alerts', value: statistics.sosAlerts },
      { id: 'solved', label: 'Solved Cases', value: statistics.solvedCases },
      { id: 'historical', label: 'Historical Crimes', value: statistics.historicalCrimes },
      { id: 'today', label: "Today's Incidents", value: statistics.todayIncidents },
    ];
  }
);

export default dashboardSlice.reducer;
