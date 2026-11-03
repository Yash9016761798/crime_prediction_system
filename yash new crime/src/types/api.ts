// API request and response type definitions

import type {
  User,
  Officer,
  FIR,
  Case,
  CrimeReport,
  SOSAlert,
  Notification,
  AuditLog,
  DashboardStatistics,
  PredictionResult,
  RiskScore,
  DistrictAnalysis,
  CrimeTypeBreakdown,
  TrendData,
  HotspotData,
  HistoricalCrime,
  TrackingMode,
  OfficerLocation,
} from './entities';
import type {
  ExportFormat,
  PaginationParams,
  PaginatedResponse,
  WebSocketMessage,
  ApiError,
  SuccessResponse,
} from './common';

// ============================================================================
// Authentication API Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ============================================================================
// Dashboard API Types
// ============================================================================

export interface DashboardStatisticsResponse extends DashboardStatistics {
  lastUpdated: Date;
}

export interface RecentCrimesResponse {
  crimes: FIR[];
  total: number;
}

export interface DistrictAnalysisResponse {
  data: DistrictAnalysis[];
  dateRange: {
    from: string;
    to: string;
  };
}

export interface CrimeTypeBreakdownResponse {
  data: CrimeTypeBreakdown[];
  total: number;
}

export interface TrendsResponse {
  data: TrendData[];
  dateRange: {
    from: string;
    to: string;
  };
}

// ============================================================================
// FIR API Types
// ============================================================================

export interface FIRFilterParams {
  search?: string;
  status?: string;
  district?: string;
  crimeType?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedOfficer?: string;
}

export interface FetchFIRsParams extends PaginationParams, FIRFilterParams {}

export interface CreateFIRRequest {
  crimeType: string;
  severity?: string;
  priority?: string;
  incidentDate: Date | string;
  location: string;
  latitude?: number;
  longitude?: number;
  district: string;
  state?: string;
  city?: string;
  policeStation?: string;
  complainantName: string;
  complainantPhone?: string;
  complainantEmail?: string;
  victims?: { name: string; age?: number; gender?: string; phone?: string; address?: string }[];
  suspects?: { name: string; alias?: string; description?: string; age?: number; gender?: string }[];
  witnesses?: { name: string; contact?: string; statement?: string }[];
  description: string;
}

export interface UpdateFIRRequest {
  crimeType?: string;
  severity?: string;
  priority?: string;
  incidentDate?: Date | string;
  location?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  state?: string;
  city?: string;
  policeStation?: string;
  complainantName?: string;
  complainantPhone?: string;
  complainantEmail?: string;
  victims?: { name: string; age?: number; gender?: string; phone?: string; address?: string }[];
  suspects?: { name: string; alias?: string; description?: string; age?: number; gender?: string }[];
  witnesses?: { name: string; contact?: string; statement?: string }[];
  description?: string;
  status?: string;
}

export interface AssignOfficerRequest {
  officerId: string;
}

export interface CloseFIRRequest {
  closureReason: string;
  resolutionNotes?: string;
}

export interface BulkDeleteRequest {
  ids: string[];
}

export interface BulkAssignRequest {
  ids: string[];
  officerId: string;
}

// ============================================================================
// Case API Types
// ============================================================================

export interface CaseFilterParams {
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignedOfficer?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchCasesParams extends PaginationParams, CaseFilterParams {}

export interface CreateCaseRequest {
  name: string;
  description?: string;
  priority: string;
  category?: string;
  crimeType?: string;
  crimeLocation?: string;
  policeStation?: string;
  district?: string;
  state?: string;
  leadOfficerId?: string;
  linkedFIRIds: string[];
  linkedFIRId?: string;
  assignedOfficerIds: string[];
  investigationStartDate?: string;
  expectedCompletionDate?: string;
}

export interface UpdateCaseRequest {
  name?: string;
  description?: string;
  priority?: string;
  category?: string;
  crimeType?: string;
  crimeLocation?: string;
  policeStation?: string;
  district?: string;
  state?: string;
  status?: string;
  leadOfficerId?: string;
  linkedFIRIds?: string[];
  linkedFIRId?: string;
  assignedOfficerIds?: string[];
  investigationStartDate?: string;
  expectedCompletionDate?: string;
}

export interface AddEvidenceRequest {
  files: File[];
  description?: string;
}

export interface ArchiveCaseRequest {
  reason?: string;
}

// ============================================================================
// User API Types
// ============================================================================

export interface UserFilterParams {
  search?: string;
  role?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchUsersParams extends PaginationParams, UserFilterParams {}

export interface CreateUserRequest {
  name: string;
  email: string;
  phone: string;
  address?: string;
  role: string;
  password: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  role?: string;
  status?: string;
}

export interface BulkSuspendRequest {
  ids: string[];
  reason?: string;
}

// ============================================================================
// Officer API Types
// ============================================================================

export interface OfficerFilterParams {
  search?: string;
  district?: string;
  rank?: string;
  status?: string;
  specialization?: string;
}

export interface FetchOfficersParams extends PaginationParams, OfficerFilterParams {}

export interface CreateOfficerRequest {
  name: string;
  badgeNumber: string;
  rank: string;
  district: string;
  phone: string;
  specialization: string[];
  userId?: string;
}

export interface UpdateOfficerRequest {
  name?: string;
  rank?: string;
  district?: string;
  phone?: string;
  specialization?: string[];
  status?: string;
}

export interface TransferOfficerRequest {
  newDistrict: string;
  transferDate: Date | string;
  reason?: string;
}

export interface AssignCasesRequest {
  caseIds: string[];
  firIds: string[];
}

// ============================================================================
// Tracking API Types
// ============================================================================

export interface TrackingFilterParams {
  search?: string;
  status?: string;
  district?: string;
  rank?: string;
  unitType?: string;
}

export interface FetchTrackingOfficersParams extends PaginationParams, TrackingFilterParams {}

export interface TrackingStatsResponse {
  total: number;
  active: number;
  onLeave: number;
  inactive: number;
  suspended: number;
  training: number;
  withLocation: number;
  byRank: Record<string, number>;
  byDistrict: Record<string, number>;
  byUnitType: Record<string, number>;
}

export interface UpdateOfficerStatusRequest {
  status: string;
}

export interface UpdateOfficerLocationRequest {
  latitude: number;
  longitude: number;
}

export interface AssignOfficerToUnitRequest {
  firId?: string;
  caseId?: string;
}

export interface NearbyOfficersTrackingResponse {
  officers: Array<Officer & { distance: number }>;
}

// ============================================================================
// Crime Report API Types
// ============================================================================

export interface CrimeReportFilterParams {
  search?: string;
  status?: string;
  district?: string;
  crimeType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchCrimeReportsParams extends PaginationParams, CrimeReportFilterParams {}

export interface CreateCrimeReportRequest {
  crimeType: string;
  crimeCategory?: string;
  incidentDate: string;
  incidentTime?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  district: string;
  state?: string;
  policeStation?: string;
  description: string;
  evidenceUrls?: string[];
  anonymous?: boolean;
}

export interface ApproveCrimeReportRequest {
  notes?: string;
}

export interface RejectCrimeReportRequest {
  reason: string;
  notes?: string;
}

export interface AssignReportOfficerRequest {
  officerId: string;
}

// ============================================================================
// SOS Alert API Types
// ============================================================================

export interface SOSAlertFilterParams {
  search?: string;
  status?: string;
  alertType?: string;
  priority?: string;
  district?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchSOSAlertsParams extends PaginationParams, SOSAlertFilterParams {}

export interface CreateSOSAlertRequest {
  userId?: string;
  alertType: string;
  priority?: string;
  description?: string;
  latitude: number;
  longitude: number;
  locationAddress?: string;
  district?: string;
  policeStation?: string;
}

export interface AssignSOSOfficerRequest {
  officerId: string;
}

export interface UpdateSOSStatusRequest {
  status: string;
  notes?: string;
}

export interface ResolveSOSRequest {
  resolutionNotes: string;
}

export interface SOSStatsResponse {
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  cancelled: number;
  avgResponseTime: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byDistrict: Record<string, number>;
}

export interface NearbyOfficersResponse {
  officers: Array<Officer & { distance: number }>;
}

// ============================================================================
// Notification API Types
// ============================================================================

export interface NotificationFilterParams {
  type?: string;
  read?: boolean;
  priority?: string;
}

export interface FetchNotificationsParams extends PaginationParams, NotificationFilterParams {}

export interface UnreadCountResponse {
  count: number;
}

// ============================================================================
// Analytics API Types
// ============================================================================

export interface AnalyticsFilterParams {
  dateFrom?: string;
  dateTo?: string;
  district?: string;
  crimeType?: string;
}

export interface CrimeTrendsResponse {
  trends: TrendData[];
  summary: {
    total: number;
    averagePerDay: number;
    peakDate: string;
    lowestDate: string;
  };
}

export interface DistrictComparisonParams {
  year?: number;
  crimeType?: string;
}

export interface DistrictComparisonResponse {
  districts: Array<{
    district: string;
    count: number;
    rank: number;
    change: number;
  }>;
}

export interface SeasonalPatternsParams {
  district?: string;
  crimeType?: string;
}

export interface SeasonalPatternsResponse {
  monthly: Array<{
    month: string;
    averageCount: number;
    years: number[];
  }>;
}

export interface HotspotsParams {
  district?: string;
  dateFrom?: string;
  dateTo?: string;
  radius?: number;
}

export interface HotspotsResponse {
  hotspots: HotspotData[];
  summary: {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  filters: {
    crimeTypes: { type: string; count: number }[];
    states: string[];
    years: number[];
  };
  detectedAt: string;
  clusters?: Array<{
    centroid: { latitude: number; longitude: number };
    radius: number;
    crimeCount: number;
  }>;
}

export type { HotspotDetail } from './entities';

export interface HistoricalDataParams {
  state?: string;
  district?: string;
  yearFrom?: number;
  yearTo?: number;
  crimeType?: string;
}

export interface HistoricalDataResponse {
  data: HistoricalCrime[];
  summary: {
    total: number;
    yearlyAverage: number;
    trend: string;
  };
}

export interface CombinedAnalyticsParams {
  district?: string;
  crimeType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CombinedAnalyticsResponse {
  historical: HistoricalCrime[];
  live: FIR[];
  comparison: {
    historicalAverage: number;
    currentPeriod: number;
    change: number;
    trend: string;
  };
}

// ============================================================================
// Prediction API Types
// ============================================================================

export interface ForecastParams {
  district: string;
  crimeType: string;
  period?: string;
}

export interface ForecastResponse extends PredictionResult {
  generatedAt: Date;
  modelVersion: string;
  trendData?: Array<{ year: number; count: number; predicted: boolean }>;
  projections?: Array<{ month: string; label: string; predicted: number; low: number; high: number }>;
  histMonthly?: Array<{ month: string; label: string; actual: number }>;
}

export interface PredictionStatsResponse {
  totalPredictions: number;
  highRiskDistricts: number;
  avgConfidence: number;
  modelAccuracy: number;
  districts: Array<{ district: string; score: number; level: string; change: number }>;
  totalDistricts: number;
  totalCrimeTypes: number;
}

export interface AllDistrictsForecastResponse {
  predictions: Array<{
    district: string;
    historicalAverage: number;
    recentTrend: number;
    forecastedCount: number;
    percentageChange: number;
    trendDirection: string;
    confidence: number;
  }>;
  crimeType: string;
  period: string;
}

export interface RiskScoreParams {
  district: string;
  date?: string;
}

export interface RiskScoreResponse extends RiskScore {
  recommendations: string[];
  yearOverYearChange?: number;
  topCrimes?: Array<{ type: string; count: number; percentage: number }>;
  yearTrend?: Array<{ year: number; count: number }>;
  totalCrimes?: number;
  contributingFactors?: Array<{ factor: string; weight: number; maxWeight: number }>;
}

export interface RiskDistrict {
  district: string;
  totalCrimes: number;
  latestYearCrimes: number;
  averagePerYear: number;
  score: number;
  level: string;
  yearOverYearChange: number;
  crimeTypeCount?: number;
}

export interface RiskAllResponse {
  districts: RiskDistrict[];
  summary: {
    totalDistricts: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    avgScore: number;
    highestRisk: RiskDistrict | null;
    lowestRisk: RiskDistrict | null;
  };
}

export interface RiskDistrictsResponse {
  districts: RiskDistrict[];
  totalDistricts: number;
}

export interface RiskHistoryResponse {
  district: string;
  history: Array<{ month: string; score: number; level: string }>;
}

export interface DeploymentRecommendationsParams {
  district: string;
  date?: string;
}

export interface DeploymentRecommendationsResponse {
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
  checkpoints: Array<{
    name: string;
    latitude: number;
    longitude: number;
    frequency: string;
  }>;
}

export interface PredictionHistoryParams {
  district?: string;
  crimeType?: string;
  limit?: number;
}

export interface PredictionHistoryResponse {
  predictions: Array<PredictionResult & {
    id: string;
    createdAt: Date;
    actualCount?: number;
    accuracy?: number;
  }>;
}

// ============================================================================
// Audit Log API Types
// ============================================================================

export interface AuditLogFilterParams {
  userId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchAuditLogsParams extends PaginationParams, AuditLogFilterParams {}

export interface ExportAuditLogsRequest {
  format: 'csv' | 'excel' | 'pdf';
  filters?: AuditLogFilterParams;
}

// ============================================================================
// Settings API Types
// ============================================================================

export interface SettingsResponse {
  theme: 'light' | 'dark';
  refreshInterval: number;
  defaultPageSize: number;
  notifications: Record<string, boolean>;
  security: {
    passwordMinLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    twoFactorEnabled: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    ipWhitelisting: boolean;
    allowedIPs: string[];
  };
  integrations: Record<string, { name: string; status: string; apiKey?: string; endpoint?: string; provider?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateSettingsRequest {
  theme?: 'light' | 'dark';
  refreshInterval?: number;
  defaultPageSize?: number;
  notifications?: Record<string, boolean>;
  security?: Partial<SettingsResponse['security']>;
  integrations?: Record<string, Partial<{ name: string; status: string; apiKey: string; endpoint: string; provider: string }>>;
}

export interface SystemInfoResponse {
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
}

// ============================================================================
// Export/Report API Types
// ============================================================================


export interface ExportRequest {
  format: ExportFormat;
  entityType: 'firs' | 'cases' | 'users' | 'officers' | 'crime-reports' | 'sos-alerts';
  filters?: Record<string, unknown>;
  columns?: string[];
}

export interface GenerateReportRequest {
  reportType: 'dashboard' | 'analytics' | 'predictions' | 'audit';
  format: ExportFormat;
  dateRange?: {
    from: string;
    to: string;
  };
  filters?: Record<string, unknown>;
  includeCharts?: boolean;
}

export interface GeneratedReport {
  id: string;
  title: string;
  type: string;
  format: string;
  size: string;
  createdAt: string;
  downloadCount: number;
}

// ============================================================================
// Heatmap API Types
// ============================================================================

export interface HeatmapFilterParams {
  year?: number;
  crimeType?: string;
  state?: string;
  layer?: string;
}

export interface HeatmapDistrict {
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  crimeCount: number;
  intensity: number;
  topCrime: string;
  topCrimeCount: number;
}

export interface HeatmapState {
  state: string;
  crimeCount: number;
  districtCount: number;
  intensity: number;
  latitude: number;
  longitude: number;
  districts: string[];
}

export interface HeatmapResponse {
  districts: HeatmapDistrict[];
  states: HeatmapState[];
  filters: {
    years: number[];
    crimeTypes: string[];
    states: string[];
  };
  summary: {
    totalDistricts: number;
    totalStates: number;
    totalCrimes: number;
  };
}

export interface HeatmapStateDistrict {
  district: string;
  latitude: number;
  longitude: number;
  crimeCount: number;
  intensity: number;
  topCrime: string;
  latestYear: number;
  latestYearCount: number;
  prevYearCount: number;
  yearOverYearChange: number;
}

export interface HeatmapStateResponse {
  state: string;
  districts: HeatmapStateDistrict[];
  summary: {
    totalDistricts: number;
    totalCrimes: number;
    topDistrict: string | null;
    topCrime: string | null;
  };
}

export interface HeatmapYearTrend {
  year: number;
  count: number;
}

export interface HeatmapCrimeBreakdown {
  type: string;
  count: number;
  percentage: number;
}

export interface HeatmapDistrictResponse {
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  totalCrimes: number;
  yearTrend: HeatmapYearTrend[];
  crimeBreakdown: HeatmapCrimeBreakdown[];
  latestYearCount: number;
  yearOverYearChange: number;
  riskScore: number;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================


export interface SOSAlertEvent {
  type: 'sos_alert_created' | 'sos_alert_updated' | 'sos_alert_resolved';
  alert: SOSAlert;
}

export interface NotificationEvent {
  type: 'notification_created';
  notification: Notification;
}

export interface FIRUpdateEvent {
  type: 'fir_created' | 'fir_updated' | 'fir_assigned' | 'fir_closed';
  fir: FIR;
}

export interface OfficerLocationEvent {
  type: 'officer_location_updated';
  officerId: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
  };
}

export interface DashboardUpdateEvent {
  type: 'dashboard_updated';
  statistics: DashboardStatistics;
}

// ============================================================================
// Real-time tracking / SOS Socket.IO event types
// ============================================================================

export interface OfficerLocationUpdateEvent {
  type: 'officer:location:updated';
  officerId: string;
  userId: string;
  name: string;
  location: { latitude: number; longitude: number };
  accuracy: number | null;
  trackingMode: TrackingMode;
  timestamp: string;
  status: string;
}

export interface OfficerStatusUpdateEvent {
  type: 'officer:status:updated';
  officerId: string;
  userId: string;
  name: string;
  status: string;
  oldStatus: string;
  timestamp: string;
}

export interface SOSNewEvent {
  type: 'sos:new';
  alert: SOSAlert;
}

export interface SOSUpdatedEvent {
  type: 'sos:updated';
  alert: SOSAlert;
  oldStatus: string;
}

export interface SOSAssignedEvent {
  type: 'sos:assigned';
  alert: SOSAlert;
  oldStatus: string;
  oldOfficerId: string | null;
}

export interface SOSResolvedEvent {
  type: 'sos:resolved';
  alert: SOSAlert;
  oldStatus: string;
  responseTime: number;
}

export interface NotificationNewEvent {
  type: 'notification:new';
  notification: Notification;
}

export interface TrackingInitialEvent {
  type: 'tracking:initial';
  officerLocations: Array<{
    officerId: string;
    userId: string;
    name: string;
    role: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    trackingMode: TrackingMode;
    timestamp: string;
    status: string;
  }>;
  officers: Array<{
    id: string;
    name: string;
    badgeNumber: string;
    status: string;
    district: string;
    currentLocation: OfficerLocation | null;
  }>;
  ts: string;
}

export type RealtimeEvent =
  | SOSAlertEvent
  | NotificationEvent
  | FIRUpdateEvent
  | OfficerLocationEvent
  | DashboardUpdateEvent
  | OfficerLocationUpdateEvent
  | OfficerStatusUpdateEvent
  | SOSNewEvent
  | SOSUpdatedEvent
  | SOSAssignedEvent
  | SOSResolvedEvent
  | NotificationNewEvent
  | TrackingInitialEvent;

export interface SocketAuthPayload {
  token: string;
}


