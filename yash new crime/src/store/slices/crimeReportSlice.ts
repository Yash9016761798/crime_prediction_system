import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { CrimeReportsState, SortConfig } from '../../types/state';
import type { CrimeReport } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: CrimeReportsState = {
  entities: {},
  ids: [],
  selectedId: null,
  filters: {
    search: '',
    status: '',
    district: '',
    crimeType: '',
    dateFrom: '',
    dateTo: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  selectedIds: [],
  loading: false,
  error: null,
};

const crimeReportSlice = createSlice({
  name: 'crimeReports',
  initialState,
  reducers: {
    setCrimeReportFilters(state, action: PayloadAction<Partial<CrimeReportsState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearCrimeReportFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setCrimeReportSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setCrimeReportPage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setCrimeReportPageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectCrimeReport(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleCrimeReportSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const index = state.selectedIds.indexOf(id);
      if (index === -1) {
        state.selectedIds.push(id);
      } else {
        state.selectedIds.splice(index, 1);
      }
    },
    clearCrimeReportSelection(state) {
      state.selectedIds = [];
    },
    selectAllCrimeReports(state) {
      state.selectedIds = [...state.ids];
    },
    clearCrimeReportError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchCrimeReports.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchCrimeReports.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: CrimeReportsState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((report: CrimeReport) => {
          entities[report.id] = report;
          ids.push(report.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchCrimeReports.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch crime reports';
      })
      .addMatcher(apiSlice.endpoints.fetchCrimeReportById.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.approveCrimeReport.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.rejectCrimeReport.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      });
  },
});

export const {
  clearCrimeReportError,
  clearCrimeReportFilters,
  clearCrimeReportSelection,
  selectAllCrimeReports,
  selectCrimeReport,
  setCrimeReportFilters,
  setCrimeReportPage,
  setCrimeReportPageSize,
  setCrimeReportSorting,
  toggleCrimeReportSelection,
} = crimeReportSlice.actions;

export const selectCrimeReportState = (state: RootState) => state.crimeReports;
export const selectAllCrimeReportEntities = createSelector(selectCrimeReportState, reports => reports.entities);
export const selectCrimeReportIds = createSelector(selectCrimeReportState, reports => reports.ids);
export const selectCrimeReportList = createSelector(
  selectAllCrimeReportEntities,
  selectCrimeReportIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectCrimeReportFilters = createSelector(selectCrimeReportState, reports => reports.filters);
export const selectCrimeReportSorting = createSelector(selectCrimeReportState, reports => reports.sorting);
export const selectCrimeReportPagination = createSelector(selectCrimeReportState, reports => reports.pagination);
export const selectCrimeReportLoading = createSelector(selectCrimeReportState, reports => reports.loading);
export const selectCrimeReportError = createSelector(selectCrimeReportState, reports => reports.error);

export default crimeReportSlice.reducer;
