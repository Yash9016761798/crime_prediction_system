// Redux state management type definitions

import type {
  User,
  Officer,
  FIR,
  Case,
  CrimeReport,
  SOSAlert,
  Notification,
  DashboardStatistics,
  DistrictAnalysis,
  CrimeTypeBreakdown,
  TrendData,
  PredictionResult,
  RiskScore,
  UserSettings,
} from './entities';
import type { LoadingState } from './common';

// ============================================================================
// Root State
// ============================================================================

export interface RootState {
  auth: AuthState;
  dashboard: DashboardState;
  firs: FIRsState;
  cases: CasesState;
  users: UsersState;
  officers: OfficersState;
  crimeReports: CrimeReportsState;
  sosAlerts: SOSAlertsState;
  notifications: NotificationsState;
  analytics: AnalyticsState;
  predictions: PredictionsState;
  settings: SettingsState;
  ui: UIState;
}

// ============================================================================
// Auth State
// ============================================================================

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Dashboard State
// ============================================================================

export interface DashboardState {
  statistics: DashboardStatistics | null;
  recentCrimes: FIR[];
  districtAnalysis: DistrictAnalysis[];
  crimeTypeBreakdown: CrimeTypeBreakdown[];
  trends: TrendData[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// ============================================================================
// FIRs State
// ============================================================================

export interface FIRFilters {
  search: string;
  status: string;
  district: string;
  crimeType: string;
  dateFrom: string;
  dateTo: string;
  assignedOfficer: string;
}

export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

export interface FIRsState {
  entities: Record<string, FIR>;
  ids: string[];
  selectedId: string | null;
  filters: FIRFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Cases State
// ============================================================================

export interface CaseFilters {
  search: string;
  status: string;
  priority: string;
  category: string;
  assignedOfficer: string;
  dateFrom: string;
  dateTo: string;
}

export interface CasesState {
  entities: Record<string, Case>;
  ids: string[];
  selectedId: string | null;
  filters: CaseFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Users State
// ============================================================================

export interface UserFilters {
  search: string;
  role: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

export interface UsersState {
  entities: Record<string, User>;
  ids: string[];
  selectedId: string | null;
  filters: UserFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Officers State
// ============================================================================

export interface OfficerFilters {
  search: string;
  district: string;
  rank: string;
  status: string;
  specialization: string;
}

export interface OfficersState {
  entities: Record<string, Officer>;
  ids: string[];
  selectedId: string | null;
  filters: OfficerFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
  // For live tracking
  liveLocations: Record<string, { latitude: number; longitude: number; timestamp: Date }>;
}

// ============================================================================
// Crime Reports State
// ============================================================================

export interface CrimeReportFilters {
  search: string;
  status: string;
  district: string;
  crimeType: string;
  dateFrom: string;
  dateTo: string;
}

export interface CrimeReportsState {
  entities: Record<string, CrimeReport>;
  ids: string[];
  selectedId: string | null;
  filters: CrimeReportFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
}

// ============================================================================
// SOS Alerts State
// ============================================================================

export interface SOSAlertFilters {
  search: string;
  status: string;
  district: string;
  dateFrom: string;
  dateTo: string;
}

export interface SOSAlertsState {
  entities: Record<string, SOSAlert>;
  ids: string[];
  selectedId: string | null;
  filters: SOSAlertFilters;
  sorting: SortConfig;
  pagination: PaginationConfig;
  loading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number; // in milliseconds
}

// ============================================================================
// Notifications State
// ============================================================================

export interface NotificationFilters {
  type: string;
  read: boolean | null;
  priority: string;
}

export interface NotificationsState {
  entities: Record<string, Notification>;
  ids: string[];
  unreadCount: number;
  filters: NotificationFilters;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Analytics State
// ============================================================================

export interface AnalyticsFilters {
  dateFrom: string;
  dateTo: string;
  district: string;
  crimeType: string;
}

export interface AnalyticsState {
  filters: AnalyticsFilters;
  trends: TrendData[];
  districtComparison: Array<{
    district: string;
    count: number;
    rank: number;
    change: number;
  }>;
  seasonalPatterns: Array<{
    month: string;
    averageCount: number;
    years: number[];
  }>;
  hotspots: Array<{
    latitude: number;
    longitude: number;
    intensity: number;
    district: string;
    crimeCount: number;
  }>;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Predictions State
// ============================================================================

export interface PredictionsState {
  currentPrediction: PredictionResult | null;
  riskScores: Record<string, RiskScore>;
  deploymentRecommendations: {
    district: string;
    date: string;
    recommendedOfficers: number;
    shifts: Array<{
      time: string;
      officers: number;
      priority: string;
    }>;
    patrolRoutes: Array<{
      name: string;
      coordinates: Array<{ latitude: number; longitude: number }>;
      priority: string;
    }>;
  } | null;
  history: Array<PredictionResult & {
    id: string;
    createdAt: Date;
    actualCount?: number;
    accuracy?: number;
  }>;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Settings State
// ============================================================================

export interface SettingsState {
  userSettings: UserSettings | null;
  systemInfo: {
    version: string;
    database: {
      status: 'connected' | 'disconnected';
      liveRecords: number;
      historicalRecords: number;
    };
    performance: {
      uptime: number;
      cpuUsage: number;
      memoryUsage: number;
      activeUsers: number;
      totalMemory?: number;
      usedMemory?: number;
    };
    lastBackup?: string;
    apiStatus?: { total: number; connected: number };
  } | null;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// UI State
// ============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

export interface ConfirmDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface UIState {
  sidebarCollapsed: boolean;
  activeModal: string | null;
  modalData: unknown;
  toasts: Toast[];
  confirmDialog: ConfirmDialogConfig | null;
  theme: 'light' | 'dark';
}

// ============================================================================
// Action Types (for async thunks)
// ============================================================================

export interface AsyncThunkConfig {
  state: RootState;
  rejectValue: string;
}

export type RequestStatus = LoadingState;

// ============================================================================
// Selector Return Types
// ============================================================================

export interface FilteredEntityList<T> {
  entities: T[];
  total: number;
  filtered: number;
}

export interface EntityStats {
  total: number;
  byStatus: Record<string, number>;
  byDistrict?: Record<string, number>;
  recent: number; // count in last 24 hours
}

