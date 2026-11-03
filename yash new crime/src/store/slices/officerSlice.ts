import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { OfficersState, SortConfig } from '../../types/state';
import type { Officer } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: OfficersState = {
  entities: {},
  ids: [],
  selectedId: null,
  filters: {
    search: '',
    district: '',
    rank: '',
    status: '',
    specialization: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  selectedIds: [],
  loading: false,
  error: null,
  liveLocations: {},
};

const officerSlice = createSlice({
  name: 'officers',
  initialState,
  reducers: {
    setOfficerFilters(state, action: PayloadAction<Partial<OfficersState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearOfficerFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setOfficerSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setOfficerPage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setOfficerPageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectOfficer(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleOfficerSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const index = state.selectedIds.indexOf(id);
      if (index === -1) {
        state.selectedIds.push(id);
      } else {
        state.selectedIds.splice(index, 1);
      }
    },
    clearOfficerSelection(state) {
      state.selectedIds = [];
    },
    selectAllOfficers(state) {
      state.selectedIds = [...state.ids];
    },
    clearOfficerError(state) {
      state.error = null;
    },
    updateOfficerLocation(state, action: PayloadAction<{ officerId: string; latitude: number; longitude: number; timestamp: Date }>) {
      state.liveLocations[action.payload.officerId] = {
        latitude: action.payload.latitude,
        longitude: action.payload.longitude,
        timestamp: action.payload.timestamp,
      };
    },
    clearOfficerLocations(state) {
      state.liveLocations = {};
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchOfficers.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchOfficers.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: OfficersState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((officer: Officer) => {
          entities[officer.id] = officer;
          ids.push(officer.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchOfficers.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch officers';
      })
      .addMatcher(apiSlice.endpoints.fetchOfficerById.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.createOfficer.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        state.ids.unshift(action.payload.id);
      })
      .addMatcher(apiSlice.endpoints.updateOfficer.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.deleteOfficer.matchFulfilled, (state, action) => {
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
  clearOfficerError,
  clearOfficerFilters,
  clearOfficerLocations,
  clearOfficerSelection,
  selectAllOfficers,
  selectOfficer,
  setOfficerFilters,
  setOfficerPage,
  setOfficerPageSize,
  setOfficerSorting,
  toggleOfficerSelection,
  updateOfficerLocation,
} = officerSlice.actions;

export const selectOfficerState = (state: RootState) => state.officers;
export const selectAllOfficerEntities = createSelector(selectOfficerState, officers => officers.entities);
export const selectOfficerIds = createSelector(selectOfficerState, officers => officers.ids);
export const selectOfficerList = createSelector(
  selectAllOfficerEntities,
  selectOfficerIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectOfficerFilters = createSelector(selectOfficerState, officers => officers.filters);
export const selectOfficerSorting = createSelector(selectOfficerState, officers => officers.sorting);
export const selectOfficerPagination = createSelector(selectOfficerState, officers => officers.pagination);
export const selectOfficerLoading = createSelector(selectOfficerState, officers => officers.loading);
export const selectOfficerError = createSelector(selectOfficerState, officers => officers.error);
export const selectOfficerSelectedIds = createSelector(selectOfficerState, officers => officers.selectedIds);
export const selectOfficerLiveLocations = createSelector(selectOfficerState, officers => officers.liveLocations);

export default officerSlice.reducer;
