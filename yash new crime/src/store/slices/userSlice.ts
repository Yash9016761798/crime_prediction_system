import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { UsersState, SortConfig } from '../../types/state';
import type { User } from '../../types/entities';
import { createPaginationConfig, createSortConfig } from './helpers';

const initialState: UsersState = {
  entities: {},
  ids: [],
  selectedId: null,
  filters: {
    search: '',
    role: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  },
  sorting: createSortConfig('createdAt', 'desc'),
  pagination: createPaginationConfig(),
  selectedIds: [],
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setUserFilters(state, action: PayloadAction<Partial<UsersState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1;
    },
    clearUserFilters(state) {
      state.filters = initialState.filters;
      state.pagination.page = 1;
    },
    setUserSorting(state, action: PayloadAction<SortConfig>) {
      state.sorting = action.payload;
    },
    setUserPage(state, action: PayloadAction<number>) {
      state.pagination.page = action.payload;
    },
    setUserPageSize(state, action: PayloadAction<number>) {
      state.pagination.pageSize = action.payload;
      state.pagination.page = 1;
    },
    selectUser(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    toggleUserSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const index = state.selectedIds.indexOf(id);
      if (index === -1) {
        state.selectedIds.push(id);
      } else {
        state.selectedIds.splice(index, 1);
      }
    },
    clearUserSelection(state) {
      state.selectedIds = [];
    },
    selectAllUsers(state) {
      state.selectedIds = [...state.ids];
    },
    clearUserError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchUsers.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchUsers.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: UsersState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((user: User) => {
          entities[user.id] = user;
          ids.push(user.id);
        });
        state.entities = entities;
        state.ids = ids;
        state.pagination.totalRecords = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addMatcher(apiSlice.endpoints.fetchUsers.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch users';
      })
      .addMatcher(apiSlice.endpoints.fetchUserById.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        if (!state.ids.includes(action.payload.id)) {
          state.ids.unshift(action.payload.id);
        }
      })
      .addMatcher(apiSlice.endpoints.createUser.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
        state.ids.unshift(action.payload.id);
      })
      .addMatcher(apiSlice.endpoints.updateUser.matchFulfilled, (state, action) => {
        state.entities[action.payload.id] = action.payload;
      })
      .addMatcher(apiSlice.endpoints.deleteUser.matchFulfilled, (state, action) => {
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
  clearUserError,
  clearUserFilters,
  clearUserSelection,
  selectAllUsers,
  selectUser,
  setUserFilters,
  setUserPage,
  setUserPageSize,
  setUserSorting,
  toggleUserSelection,
} = userSlice.actions;

export const selectUserState = (state: RootState) => state.users;
export const selectAllUserEntities = createSelector(selectUserState, users => users.entities);
export const selectUserIds = createSelector(selectUserState, users => users.ids);
export const selectUserList = createSelector(
  selectAllUserEntities,
  selectUserIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectUserFilters = createSelector(selectUserState, users => users.filters);
export const selectUserSorting = createSelector(selectUserState, users => users.sorting);
export const selectUserPagination = createSelector(selectUserState, users => users.pagination);
export const selectUserLoading = createSelector(selectUserState, users => users.loading);
export const selectUserError = createSelector(selectUserState, users => users.error);
export const selectUserSelectedIds = createSelector(selectUserState, users => users.selectedIds);

export default userSlice.reducer;
