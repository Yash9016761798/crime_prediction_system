import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { FIRsState, SortConfig } from '../../types/state';
import type { FIR } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: FIRsState = {
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
    assignedOfficer: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  selectedIds: [],
  loading: false,
  error: null,
};

const firSlice = createSlice({
  name: 'firs',
  initialState,
  reducers: {
    setFIRFilters(state, action: PayloadAction<Partial<FIRsState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearFIRFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setFIRSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setFIRPage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setFIRPageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectFIR(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleFIRSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const index = state.selectedIds.indexOf(id);
      if (index === -1) {
        state.selectedIds.push(id);
      } else {
        state.selectedIds.splice(index, 1);
      }
    },
    clearFIRSelection(state) {
      state.selectedIds = [];
    },
    selectAllFIRs(state) {
      state.selectedIds = [...state.ids];
    },
    clearFIRError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchFIRs.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchFIRs.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: FIRsState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((fir: import('../../types/entities').FIR) => {
          entities[fir.id] = fir;
          ids.push(fir.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchFIRs.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch FIRs';
      })
      .addMatcher(apiSlice.endpoints.fetchFIRById.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchFIRById.matchFulfilled, (state, action) => {
        state.loading = false;
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.fetchFIRById.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch FIR';
      })
      .addMatcher(apiSlice.endpoints.createFIR.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        state.ids.unshift(action.payload.id);
      })
      .addMatcher(apiSlice.endpoints.updateFIR.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.closeFIR.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.assignFirOfficer.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.deleteFIR.matchFulfilled, (state, action) => {
        const deletedId = action.meta.arg.originalArgs as string;
        delete state.entities[deletedId];
        state.ids = state.ids.filter(id => id !== deletedId);
        state.selectedIds = state.selectedIds.filter(id => id !== deletedId);
        if (state.selectedId === deletedId) {
          state.selectedId = null;
        }
      });
  },
});

export const {
  clearFIRError,
  clearFIRFilters,
  clearFIRSelection,
  selectAllFIRs,
  selectFIR,
  setFIRFilters,
  setFIRPage,
  setFIRPageSize,
  setFIRSorting,
  toggleFIRSelection,
} = firSlice.actions;

export const selectFIRState = (state: RootState) => state.firs;
export const selectAllFIREntities = createSelector(selectFIRState, firs => firs.entities);
export const selectFIRIds = createSelector(selectFIRState, firs => firs.ids);
export const selectFIRList = createSelector(
  selectAllFIREntities,
  selectFIRIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectSelectedFIR = createSelector(
  selectAllFIREntities,
  (_state: RootState, id: string) => id,
  (entities, id) => entities[id] ?? null
);
export const selectFIRFilters = createSelector(selectFIRState, firs => firs.filters);
export const selectFIRSorting = createSelector(selectFIRState, firs => firs.sorting);
export const selectFIRPagination = createSelector(selectFIRState, firs => firs.pagination);
export const selectFIRLoading = createSelector(selectFIRState, firs => firs.loading);
export const selectFIRError = createSelector(selectFIRState, firs => firs.error);
export const selectFIRSelectedIds = createSelector(selectFIRState, firs => firs.selectedIds);

export default firSlice.reducer;
