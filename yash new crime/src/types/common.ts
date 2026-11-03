// Common utility types and type helpers

import type { ReactNode } from 'react';

// ============================================================================
// Generic Utility Types
// ============================================================================

/**
 * Makes all properties in T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Makes specified properties K of T required
 */
export type RequireProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes specified properties K of T optional
 */
export type PartialProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extracts keys from T where the value is of type V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Makes all properties in T nullable
 */
export type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

/**
 * Removes null and undefined from T
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface FilterParams {
  search?: string;
  status?: string;
  district?: string;
  crimeType?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface SuccessResponse {
  message: string;
  data?: unknown;
}

// ============================================================================
// Date Range Types
// ============================================================================

export interface DateRange {
  from: Date | string;
  to: Date | string;
}

export interface DateRangeString {
  from: string;
  to: string;
}

// ============================================================================
// Location Types
// ============================================================================

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location extends Coordinates {
  address?: string;
  district?: string;
  state?: string;
  country?: string;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ============================================================================
// File Upload Types
// ============================================================================

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
}

export interface FileUploadProgress {
  file: File;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

// ============================================================================
// Chart Data Types
// ============================================================================

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface TimeSeriesDataPoint {
  timestamp: Date | string;
  value: number;
  label?: string;
}

export interface ComparisonDataPoint {
  category: string;
  current: number;
  previous?: number;
  target?: number;
}

// ============================================================================
// Async State Types
// ============================================================================

export type LoadingState = 'idle' | 'pending' | 'succeeded' | 'failed';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  status: LoadingState;
}

export interface AsyncStateWithTimestamp<T> extends AsyncState<T> {
  lastFetched: Date | null;
}

// ============================================================================
// Selection Types
// ============================================================================

export interface SelectionState {
  selectedIds: string[];
  isAllSelected: boolean;
  excludedIds: string[];
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
}

export type FormFieldValue = string | number | boolean | Date | string[] | File | null | undefined;

export interface FormErrors {
  [key: string]: string | undefined;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchParams {
  query: string;
  filters?: FilterParams;
  page?: number;
  limit?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  query: string;
  page: number;
  hasMore: boolean;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastNotification {
  id: string;
  variant: NotificationVariant;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// ============================================================================
// Modal Types
// ============================================================================

export interface ModalConfig {
  title: string;
  content: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

// ============================================================================
// Table Types
// ============================================================================

export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: unknown, row: T, index: number) => ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;
}

export interface TableAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (row: T) => void;
  variant?: 'default' | 'primary' | 'danger' | 'warning';
  disabled?: (row: T) => boolean;
  hidden?: (row: T) => boolean;
}

// ============================================================================
// Menu Types
// ============================================================================

export interface MenuOption {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  children?: MenuOption[];
}

// ============================================================================
// Permission Types
// ============================================================================

export type Permission =
  | 'view_dashboard'
  | 'manage_firs'
  | 'manage_cases'
  | 'manage_users'
  | 'manage_officers'
  | 'view_analytics'
  | 'generate_predictions'
  | 'approve_reports'
  | 'respond_sos'
  | 'view_audit_logs'
  | 'manage_settings'
  | 'export_data';

export type Role = 'citizen' | 'admin' | 'officer' | 'super_admin' | 'viewer';

export interface RolePermissions {
  role: Role;
  permissions: Permission[];
}

// ============================================================================
// Audit Types
// ============================================================================

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'APPROVE'
  | 'REJECT'
  | 'ASSIGN'
  | 'CLOSE'
  | 'ARCHIVE'
  | 'EXPORT';

export type EntityType =
  | 'USER'
  | 'OFFICER'
  | 'FIR'
  | 'CASE'
  | 'CRIME_REPORT'
  | 'SOS_ALERT'
  | 'NOTIFICATION'
  | 'SETTINGS';

// ============================================================================
// Statistics Types
// ============================================================================

export interface StatisticValue {
  value: number;
  change?: number; // percentage change
  changeDirection?: 'up' | 'down' | 'stable';
  comparisonPeriod?: string;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  percentage: number;
  period: string;
  confidence?: number;
}

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  columns?: string[];
  filters?: FilterParams;
  includeHeaders?: boolean;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: Date | string;
  id?: string;
}

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketState {
  status: WebSocketStatus;
  error?: string;
  lastMessage?: WebSocketMessage;
  reconnectAttempts: number;
}

// ============================================================================
// Theme Types
// ============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  apiBaseUrl: string;
  wsUrl: string;
  mapboxToken?: string;
  googleMapsKey?: string;
  enableAnalytics: boolean;
  refreshInterval: number;
  maxFileSize: number;
  allowedFileTypes: string[];
  paginationPageSizes: number[];
  defaultPageSize: number;
}

// ============================================================================
// Breakpoint Types
// ============================================================================

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ResponsiveValue<T> {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

export function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'field' in error &&
    'message' in error &&
    typeof (error as ValidationError).field === 'string' &&
    typeof (error as ValidationError).message === 'string'
  );
}

export function isPaginatedResponse<T>(response: unknown): response is PaginatedResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    Array.isArray((response as PaginatedResponse<T>).data) &&
    'total' in response &&
    'page' in response &&
    'pageSize' in response &&
    'totalPages' in response
  );
}

