import { isRejectedWithValue, type Middleware } from '@reduxjs/toolkit';
import { addToast } from './slices/uiSlice';

function getErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return 'Request failed. Please try again.';
}

export const loggerMiddleware: Middleware = () => next => (action: unknown) => {
  if (import.meta.env.DEV) {
    const typedAction = action as { type?: string };
    if (typedAction.type) {
      console.debug('[store]', typedAction.type);
    }
  }

  return next(action);
};

export const errorMiddleware: Middleware = api => next => action => {
  if (isRejectedWithValue(action)) {
    const message = getErrorMessage(action.payload);

    console.error('[store:error]', action.type, action.payload);
    api.dispatch(
      addToast({
        type: 'error',
        message,
        duration: 5000,
      })
    );
  }

  return next(action);
};
