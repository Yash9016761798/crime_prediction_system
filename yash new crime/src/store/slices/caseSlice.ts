import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { CasesState, SortConfig } from '../../types/state';
import type { Case } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: CasesState = {
  entities: {},
  ids: [],
  selectedId: null,
  filters: {
    search: '',
    status: '',
    priority: '',
    category: '',
    assignedOfficer: '',
    dateFrom: '',
    dateTo: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  selectedIds: [],
  loading: false,
  error: null,
};

const caseSlice = createSlice({
  name: 'cases',
  initialState,
  reducers: {
    setCaseFilters(state, action: PayloadAction<Partial<CasesState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearCaseFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setCaseSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setCasePage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setCasePageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectCase(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleCaseSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const index = state.selectedIds.indexOf(id);
      if (index === -1) {
        state.selectedIds.push(id);
      } else {
        state.selectedIds.splice(index, 1);
      }
    },
    clearCaseSelection(state) {
      state.selectedIds = [];
    },
    selectAllCases(state) {
      state.selectedIds = [...state.ids];
    },
    clearCaseError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchCases.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchCases.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: CasesState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((c: Case) => {
          entities[c.id] = c;
          ids.push(c.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchCases.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch cases';
      })
      .addMatcher(apiSlice.endpoints.fetchCaseById.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.createCase.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        state.ids.unshift(action.payload.id);
      })
      .addMatcher(apiSlice.endpoints.updateCase.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.deleteCase.matchFulfilled, (state, action) => {
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
  clearCaseError,
  clearCaseFilters,
  clearCaseSelection,
  selectAllCases,
  selectCase,
  setCaseFilters,
  setCasePage,
  setCasePageSize,
  setCaseSorting,
  toggleCaseSelection,
} = caseSlice.actions;

export const selectCaseState = (state: RootState) => state.cases;
export const selectAllCaseEntities = createSelector(selectCaseState, cases => cases.entities);
export const selectCaseIds = createSelector(selectCaseState, cases => cases.ids);
export const selectCaseList = createSelector(
  selectAllCaseEntities,
  selectCaseIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectCaseFilters = createSelector(selectCaseState, cases => cases.filters);
export const selectCaseSorting = createSelector(selectCaseState, cases => cases.sorting);
export const selectCasePagination = createSelector(selectCaseState, cases => cases.pagination);
export const selectCaseLoading = createSelector(selectCaseState, cases => cases.loading);
export const selectCaseError = createSelector(selectCaseState, cases => cases.error);
export const selectCaseSelectedIds = createSelector(selectCaseState, cases => cases.selectedIds);

export default caseSlice.reducer;
