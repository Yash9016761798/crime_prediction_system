import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { PredictionsState } from '../../types/state';

const initialState: PredictionsState = {
  currentPrediction: null,
  riskScores: {},
  deploymentRecommendations: null,
  history: [],
  loading: false,
  error: null,
};

const predictionsSlice = createSlice({
  name: 'predictions',
  initialState,
  reducers: {
    clearCurrentPrediction(state) {
      state.currentPrediction = null;
    },
    clearDeploymentRecommendations(state) {
      state.deploymentRecommendations = null;
    },
    clearPredictionsError(state) {
      state.error = null;
    },
    resetPredictionsState() {
      return initialState;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(
        action =>
          apiSlice.endpoints.getForecast.matchPending(action) ||
          apiSlice.endpoints.getRiskScore.matchPending(action) ||
          apiSlice.endpoints.getDeploymentRecommendations.matchPending(action) ||
          apiSlice.endpoints.getPredictionHistory.matchPending(action),
        state => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(apiSlice.endpoints.getForecast.matchFulfilled, (state, action) => {
        state.currentPrediction = action.payload;
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getRiskScore.matchFulfilled, (state, action) => {
        state.riskScores[action.payload.district] = {
          district: action.payload.district,
          score: action.payload.score,
          level: action.payload.level,
          historicalRate: action.payload.historicalRate,
          recentIncidents: action.payload.recentIncidents,
          contributingFactors: action.payload.contributingFactors ?? [],
          lastUpdated: action.payload.lastUpdated,
        };
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getDeploymentRecommendations.matchFulfilled, (state, action) => {
        state.deploymentRecommendations = {
          district: action.payload.district,
          date: action.payload.date,
          recommendedOfficers: action.payload.recommendedOfficers,
          shifts: action.payload.shifts,
          patrolRoutes: action.payload.patrolRoutes,
        };
        state.loading = false;
      })
      .addMatcher(apiSlice.endpoints.getPredictionHistory.matchFulfilled, (state, action) => {
        state.history = action.payload.predictions;
        state.loading = false;
      })
      .addMatcher(
        action =>
          apiSlice.endpoints.getForecast.matchRejected(action) ||
          apiSlice.endpoints.getRiskScore.matchRejected(action) ||
          apiSlice.endpoints.getDeploymentRecommendations.matchRejected(action) ||
          apiSlice.endpoints.getPredictionHistory.matchRejected(action),
        (state, action) => {
          state.loading = false;
          state.error = action.error.message ?? 'Failed to load prediction data';
        }
      );
  },
});

export const {
  clearCurrentPrediction,
  clearDeploymentRecommendations,
  clearPredictionsError,
  resetPredictionsState,
} = predictionsSlice.actions;

export const selectPredictionsState = (state: RootState) => state.predictions;
export const selectCurrentPrediction = createSelector(selectPredictionsState, p => p.currentPrediction);
export const selectRiskScores = createSelector(selectPredictionsState, p => p.riskScores);
export const selectDeploymentRecommendations = createSelector(
  selectPredictionsState,
  p => p.deploymentRecommendations
);
export const selectPredictionHistory = createSelector(selectPredictionsState, p => p.history);
export const selectPredictionsLoading = createSelector(selectPredictionsState, p => p.loading);
export const selectPredictionsError = createSelector(selectPredictionsState, p => p.error);

export default predictionsSlice.reducer;
