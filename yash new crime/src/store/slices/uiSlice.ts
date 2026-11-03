import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import type { ConfirmDialogConfig, Toast, UIState } from '../../types/state';

const initialState: UIState = {
  sidebarCollapsed: false,
  activeModal: null,
  modalData: null,
  toasts: [],
  confirmDialog: null,
  theme: 'light',
};

const createToastId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    openModal(
      state,
      action: PayloadAction<{ modalName: string; data?: unknown }>
    ) {
      state.activeModal = action.payload.modalName;
      state.modalData = action.payload.data ?? null;
    },
    closeModal(state) {
      state.activeModal = null;
      state.modalData = null;
    },
    addToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(payload: Omit<Toast, 'id'> & { id?: string }) {
        return {
          payload: {
            id: payload.id ?? createToastId(),
            ...payload,
          },
        };
      },
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter(toast => toast.id !== action.payload);
    },
    clearToasts(state) {
      state.toasts = [];
    },
    showConfirmDialog(state, action: PayloadAction<ConfirmDialogConfig>) {
      state.confirmDialog = action.payload;
    },
    hideConfirmDialog(state) {
      state.confirmDialog = null;
    },
    setTheme(state, action: PayloadAction<UIState['theme']>) {
      state.theme = action.payload;
    },
  },
});

export const {
  addToast,
  clearToasts,
  closeModal,
  hideConfirmDialog,
  openModal,
  removeToast,
  setSidebarCollapsed,
  setTheme,
  showConfirmDialog,
  toggleSidebar,
} = uiSlice.actions;

export const selectUIState = (state: RootState) => state.ui;
export const selectSidebarCollapsed = createSelector(
  selectUIState,
  ui => ui.sidebarCollapsed
);
export const selectActiveModal = createSelector(selectUIState, ui => ui.activeModal);
export const selectModalData = createSelector(selectUIState, ui => ui.modalData);
export const selectToasts = createSelector(selectUIState, ui => ui.toasts);
export const selectConfirmDialog = createSelector(
  selectUIState,
  ui => ui.confirmDialog
);
export const selectTheme = createSelector(selectUIState, ui => ui.theme);

export default uiSlice.reducer;
