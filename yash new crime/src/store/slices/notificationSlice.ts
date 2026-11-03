import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiSlice } from '../api';
import type { RootState } from '../index';
import type { NotificationsState } from '../../types/state';
import type { Notification } from '../../types/entities';

const initialState: NotificationsState = {
  entities: {},
  ids: [],
  unreadCount: 0,
  filters: {
    type: '',
    read: null,
    priority: '',
  },
  loading: false,
  error: null,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setNotificationFilters(state, action: PayloadAction<Partial<NotificationsState['filters']>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearNotificationFilters(state) {
      state.filters = initialState.filters;
    },
    clearNotificationError(state) {
      state.error = null;
    },
    markAsRead(state, action: PayloadAction<string>) {
      const notification = state.entities[action.payload];
      if (notification && !notification.read) {
        notification.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllAsReadLocally(state) {
      Object.values(state.entities).forEach(n => {
        n.read = true;
      });
      state.unreadCount = 0;
    },
    addNotificationLocally(state, action: PayloadAction<import('../../types/entities').Notification>) {
      const notification = action.payload;
      state.entities[notification.id] = notification;
      state.ids.unshift(notification.id);
      if (!notification.read) {
        state.unreadCount += 1;
      }
    },
  },
  extraReducers: builder => {
    builder
      .addMatcher(apiSlice.endpoints.fetchNotifications.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(apiSlice.endpoints.fetchNotifications.matchFulfilled, (state, action) => {
        state.loading = false;
        const entities: NotificationsState['entities'] = {};
        const ids: string[] = [];
        action.payload.data.forEach((n: Notification) => {
          entities[n.id] = n;
          ids.push(n.id);
        });
        state.entities = entities;
        state.ids = ids;
      })
      .addMatcher(apiSlice.endpoints.fetchNotifications.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch notifications';
      })
      .addMatcher(apiSlice.endpoints.markNotificationRead.matchFulfilled, (state, action) => {
        const notification = state.entities[action.payload.id];
        if (notification && !notification.read) {
          notification.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addMatcher(apiSlice.endpoints.markAllNotificationsRead.matchFulfilled, state => {
        Object.values(state.entities).forEach(n => {
          n.read = true;
        });
        state.unreadCount = 0;
      })
      .addMatcher(apiSlice.endpoints.getUnreadNotificationCount.matchFulfilled, (state, action) => {
        state.unreadCount = action.payload;
      });
  },
});

export const {
  addNotificationLocally,
  clearNotificationError,
  clearNotificationFilters,
  markAllAsReadLocally,
  markAsRead,
  setNotificationFilters,
} = notificationSlice.actions;

export const selectNotificationState = (state: RootState) => state.notifications;
export const selectAllNotificationEntities = createSelector(selectNotificationState, n => n.entities);
export const selectNotificationIds = createSelector(selectNotificationState, n => n.ids);
export const selectNotificationList = createSelector(
  selectAllNotificationEntities,
  selectNotificationIds,
  (entities, ids) => ids.map(id => entities[id]).filter(Boolean)
);
export const selectUnreadNotificationCount = createSelector(
  selectNotificationState,
  n => n.unreadCount
);
export const selectNotificationLoading = createSelector(selectNotificationState, n => n.loading);
export const selectNotificationError = createSelector(selectNotificationState, n => n.error);
export const selectNotificationFilters = createSelector(selectNotificationState, n => n.filters);

export default notificationSlice.reducer;
