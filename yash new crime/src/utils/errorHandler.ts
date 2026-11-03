import { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    // Handle Axios errors
    if (error.response) {
      // Server responded with error
      const data = error.response.data as any;
      return data?.message || data?.error || 'An error occurred';
    } else if (error.request) {
      // Request made but no response
      return 'Network error - please check your connection';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unknown error occurred';
}

/**
 * Extract detailed API error information
 */
export function parseApiError(error: unknown): ApiError {
  if (error instanceof AxiosError && error.response) {
    const data = error.response.data as any;
    return {
      message: data?.message || 'An error occurred',
      statusCode: error.response.status,
      errors: data?.errors,
    };
  }

  return {
    message: getErrorMessage(error),
  };
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AxiosError && error.response) {
    return error.response.status === 401;
  }
  return false;
}

/**
 * Check if error is a permission error
 */
export function isPermissionError(error: unknown): boolean {
  if (error instanceof AxiosError && error.response) {
    return error.response.status === 403;
  }
  return false;
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof AxiosError && error.response) {
    return error.response.status === 404;
  }
  return false;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof AxiosError && error.response) {
    return error.response.status === 422 || error.response.status === 400;
  }
  return false;
}
