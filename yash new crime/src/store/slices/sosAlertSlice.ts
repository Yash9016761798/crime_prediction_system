import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { SOSAlertsState, SortConfig } from '../../types/state';
import type { SOSAlert } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: SOSAlertsState = {
  entities: {},
  ids: [],
  selectedId: null,
  filters: {
    search: '',
    status: '',
    district: '',
    dateFrom: '',
    dateTo: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  loading: false,
  error: null,
  autoRefresh: false,
  refreshInterval: 30000,
};

const sosAlertSlice = createSlice({
  name: 'sosAlerts',
  initialState,
  reducers: {
    setSOSAlertFilters(state, action: PayloadAction<Partial<SOSAlertsState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearSOSAlertFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setSOSAlertSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setSOSAlertPage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setSOSAlertPageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectSOSAlert(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    clearSOSAlertError(state) {
      state.error = null;
    },
    setAutoRefresh(state, action: PayloadAction<boolean>) {
      state.autoRefresh = action.payload;
    },
    setRefreshInterval(state, action: PayloadAction<number>) {
      state.refreshInterval = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchSOSAlerts.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchSOSAlerts.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: SOSAlertsState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((alert: SOSAlert) => {
          entities[alert.id] = alert;
          ids.push(alert.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchSOSAlerts.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch SOS alerts';
      })
      .addMatcher(apiSlice.endpoints.fetchSOSAlertById.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.assignSOSOfficer.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.resolveSOSAlert.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      });
  },
});

export const {
  clearSOSAlertError,
  clearSOSAlertFilters,
  selectSOSAlert,
  setAutoRefresh,
  setRefreshInterval,
  setSOSAlertFilters,
  setSOSAlertPage,
  setSOSAlertPageSize,
  setSOSAlertSorting,
} = sosAlertSlice.actions;

export const selectSOSAlertState = (state: RootState) => state.sosAlerts;
export const selectAllSOSAlertEntities = createSelector(selectSOSAlertState, alerts => alerts.entities);
export const selectSOSAlertIds = createSelector(selectSOSAlertState, alerts => alerts.ids);
export const selectSOSAlertList = createSelector(
  selectAllSOSAlertEntities,
  selectSOSAlertIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectSOSAlertFilters = createSelector(selectSOSAlertState, alerts => alerts.filters);
export const selectSOSAlertSorting = createSelector(selectSOSAlertState, alerts => alerts.sorting);
export const selectSOSAlertPagination = createSelector(selectSOSAlertState, alerts => alerts.pagination);
export const selectSOSAlertLoading = createSelector(selectSOSAlertState, alerts => alerts.loading);
export const selectSOSAlertError = createSelector(selectSOSAlertState, alerts => alerts.error);
export const selectSOSAlertAutoRefresh = createSelector(selectSOSAlertState, alerts => alerts.autoRefresh);

export default sosAlertSlice.reducer;
