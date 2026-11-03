// Component prop type definitions

import type { ReactNode } from 'react';
import type {
  FIR,
  Case,
  Officer,
  User,
  CrimeReport,
  SOSAlert,
  Notification,
  TrendDirection,
} from './entities';
import type { ChartDataPoint } from './common';

// ============================================================================
// DataTable Component Props
// ============================================================================

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (selectedRows: T[]) => void;
  variant?: 'default' | 'danger' | 'warning';
  requiresConfirmation?: boolean;
  confirmMessage?: string;
}

export interface ExportOption {
  label: string;
  format: 'csv' | 'excel' | 'pdf';
  icon?: ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading: boolean;
  error?: string;
  onSearch?: (query: string) => void;
  onFilter?: (filters: Record<string, unknown>) => void;
  onSort?: (field: string, direction: 'asc' | 'desc') => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRowClick?: (row: T) => void;
  onRowSelect?: (selectedRows: T[]) => void;
  bulkActions?: BulkAction<T>[];
  exportOptions?: ExportOption[];
  currentPage: number;
  pageSize: number;
  totalRecords: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  selectable?: boolean;
  stickyHeader?: boolean;
}

// ============================================================================
// InsightCard Component Props
// ============================================================================

export interface InsightCardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  trend?: {
    direction: 'up' | 'down';
    percentage: number;
  };
  actionLabel?: string;
  onClick?: () => void;
  loading?: boolean;
  variant?: 'default' | 'warning' | 'danger' | 'success';
  subtitle?: string;
}

// ============================================================================
// FilterBar Component Props
// ============================================================================

export type FilterType = 'text' | 'select' | 'daterange' | 'multiselect' | 'date';

export interface FilterOption {
  label: string;
  value: string | number | boolean;
}

export interface FilterConfig {
  name: string;
  label: string;
  type: FilterType;
  options?: FilterOption[];
  placeholder?: string;
  defaultValue?: unknown;
}

export interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, unknown>;
  onChange: (filterName: string, value: unknown) => void;
  onClear: () => void;
  onApply: () => void;
  loading?: boolean;
  showApplyButton?: boolean;
}

// ============================================================================
// FormModal Component Props
// ============================================================================

export type FormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'radio'
  | 'file';

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: FilterOption[];
  validation?: {
    pattern?: RegExp;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    custom?: (value: unknown) => string | null;
  };
  helperText?: string;
  defaultValue?: unknown;
}

export interface FormModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  fields: FormField[];
  initialData?: Record<string, unknown>;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// ============================================================================
// Chart Component Props
// ============================================================================


export interface LineChartProps {
  data: Array<{ date: string; count: number; predicted?: boolean }>;
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  height?: number;
  loading?: boolean;
}

export interface BarChartProps {
  data: ChartDataPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
  horizontal?: boolean;
  showGrid?: boolean;
  height?: number;
  loading?: boolean;
  onClick?: (dataPoint: ChartDataPoint) => void;
}

export interface PieChartProps {
  data: ChartDataPoint[];
  title?: string;
  showLegend?: boolean;
  showPercentage?: boolean;
  height?: number;
  loading?: boolean;
  onClick?: (dataPoint: ChartDataPoint) => void;
}

// ============================================================================
// Map Component Props
// ============================================================================

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  type: 'crime' | 'sos' | 'officer' | 'hotspot';
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  onClick?: () => void;
  popupContent?: ReactNode;
}

export interface MapLayer {
  id: string;
  name: string;
  type: 'heatmap' | 'markers' | 'clusters' | 'polygons' | 'routes';
  data: unknown;
  visible: boolean;
  opacity?: number;
}

export interface MapProps {
  center: { latitude: number; longitude: number };
  zoom: number;
  markers?: MapMarker[];
  layers?: MapLayer[];
  onMarkerClick?: (marker: MapMarker) => void;
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
  onBoundsChange?: (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => void;
  height?: string | number;
  showControls?: boolean;
  showSearch?: boolean;
}

export interface HeatmapLayer {
  points: Array<{
    latitude: number;
    longitude: number;
    intensity: number;
  }>;
  gradient?: Record<number, string>;
  radius?: number;
  maxIntensity?: number;
}

// ============================================================================
// Drawer Component Props
// ============================================================================

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  position?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
}

// ============================================================================
// Entity Detail Drawer Props
// ============================================================================

export interface FIRDetailDrawerProps {
  fir: FIR | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (fir: FIR) => void;
  onAssign?: (fir: FIR) => void;
  onCloseFIR?: (fir: FIR) => void;
  onDelete?: (fir: FIR) => void;
}

export interface CaseDetailDrawerProps {
  case: Case | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (caseData: Case) => void;
  onAddEvidence?: (caseData: Case) => void;
  onArchive?: (caseData: Case) => void;
}

export interface CrimeReportDetailDrawerProps {
  report: CrimeReport | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (report: CrimeReport) => void;
  onReject?: (report: CrimeReport) => void;
  onAssign?: (report: CrimeReport) => void;
}

export interface SOSAlertDetailDrawerProps {
  alert: SOSAlert | null;
  isOpen: boolean;
  onClose: () => void;
  onAssign?: (alert: SOSAlert) => void;
  onUpdateStatus?: (alert: SOSAlert, status: string) => void;
  onResolve?: (alert: SOSAlert) => void;
}

// ============================================================================
// EmptyState Component Props
// ============================================================================

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================================
// LoadingSkeleton Component Props
// ============================================================================

export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'table' | 'chart';
  width?: string | number;
  height?: string | number;
  count?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

// ============================================================================
// ConfirmDialog Component Props
// ============================================================================

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

// ============================================================================
// Toast Component Props
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// ============================================================================
// Navigation Component Props
// ============================================================================

export interface MenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  path?: string;
  onClick?: () => void;
  badge?: number | string;
  children?: MenuItem[];
  requiresAuth?: boolean;
  roles?: string[];
}

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  menuItems: MenuItem[];
  activeItem?: string;
  onItemClick?: (item: MenuItem) => void;
}

export interface TopNavigationProps {
  title?: string;
  showSearch?: boolean;
  onSearch?: (query: string) => void;
  notifications?: Notification[];
  unreadCount?: number;
  onNotificationClick?: (notification: Notification) => void;
  user?: User | null;
  onLogout?: () => void;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
}

// ============================================================================
// Notification Dropdown Props
// ============================================================================

export interface NotificationDropdownProps {
  notifications: Notification[];
  unreadCount: number;
  onNotificationClick: (notification: Notification) => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onViewAll: () => void;
  loading?: boolean;
}

// ============================================================================
// Profile Dropdown Props
// ============================================================================

export interface ProfileDropdownProps {
  user: User | null;
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onLogout: () => void;
}

// ============================================================================
// Dashboard Components Props
// ============================================================================

export interface DashboardStatsProps {
  statistics: {
    totalFIRs: number;
    activeCases: number;
    pendingReports: number;
    activeOfficers: number;
    sosAlerts: number;
    solvedCases: number;
  };
  loading?: boolean;
  onStatClick?: (statKey: string) => void;
}

export interface RecentCrimesTableProps {
  crimes: FIR[];
  loading?: boolean;
  onCrimeClick?: (crime: FIR) => void;
  onViewAll?: () => void;
}

// ============================================================================
// Prediction Components Props
// ============================================================================

export interface PredictionFormProps {
  onSubmit: (params: { district: string; crimeType: string; month: string }) => void;
  loading?: boolean;
  districts: string[];
  crimeTypes: string[];
}

export interface ForecastResultCardProps {
  prediction: {
    forecastedCount: number;
    confidence: number;
    trendDirection: TrendDirection;
    percentageChange: number;
  };
  loading?: boolean;
}

export interface RecommendationsPanelProps {
  recommendations: {
    officerCount: number;
    patrolShifts: string[];
    priorityAreas: string[];
    preventiveMeasures: string[];
  };
  loading?: boolean;
}

// ============================================================================
// Assignment Dialog Props
// ============================================================================

export interface AssignOfficerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (officerId: string) => void;
  officers: Officer[];
  entityType: 'fir' | 'case' | 'crime-report' | 'sos-alert';
  entityId?: string;
  loading?: boolean;
}

// ============================================================================
// Status Badge Props
// ============================================================================

export interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

// ============================================================================
// File Upload Props
// ============================================================================

export interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  maxFiles?: number;
  onUpload: (files: File[]) => Promise<void>;
  loading?: boolean;
  value?: string[]; // URLs of uploaded files
  onRemove?: (url: string) => void;
  showPreview?: boolean;
}

// ============================================================================
// Search Input Props
// ============================================================================

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  onSearch?: (value: string) => void;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showClearButton?: boolean;
}

// ============================================================================
// Pagination Props
// ============================================================================

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRecords: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  showFirstLast?: boolean;
  showPageInfo?: boolean;
}

// ============================================================================
// Breadcrumbs Props
// ============================================================================

export interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
}

// ============================================================================
// Card Props
// ============================================================================

export interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  loading?: boolean;
}

// ============================================================================
// Tabs Props
// ============================================================================

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
  badge?: number | string;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  orientation?: 'horizontal' | 'vertical';
}

// ============================================================================
// Timeline Props
// ============================================================================

export interface TimelineItem {
  id: string;
  timestamp: Date;
  title: string;
  description?: string;
  icon?: ReactNode;
  user?: string;
  type?: 'created' | 'updated' | 'deleted' | 'comment' | 'status_change';
}

export interface TimelineProps {
  items: TimelineItem[];
  loading?: boolean;
  variant?: 'default' | 'compact';
}

