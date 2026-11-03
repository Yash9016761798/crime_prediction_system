import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from './index';
import type {
  FIR,
  Case,
  User,
  Officer,
  CrimeReport,
  SOSAlert,
  Notification,
  AuditLog,
  PredictionResult,
  RiskScore,
  DistrictAnalysis,
  CrimeTypeBreakdown,
  TrendData,
  HotspotData,
  HotspotDetail,
  HistoricalCrime,
} from '../types/entities';
import type {
  PaginatedResponse,
  SuccessResponse,
} from '../types/common';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RefreshTokenResponse,
  DashboardStatisticsResponse,
  FetchFIRsParams,
  CreateFIRRequest,
  UpdateFIRRequest,
  AssignOfficerRequest,
  CloseFIRRequest,
  FetchCasesParams,
  CreateCaseRequest,
  UpdateCaseRequest,
  FetchUsersParams,
  CreateUserRequest,
  UpdateUserRequest,
  FetchOfficersParams,
  CreateOfficerRequest,
  UpdateOfficerRequest,
  FetchTrackingOfficersParams,
  TrackingStatsResponse,
  UpdateOfficerStatusRequest,
  UpdateOfficerLocationRequest,
  AssignOfficerToUnitRequest,
  FetchCrimeReportsParams,
  ApproveCrimeReportRequest,
  RejectCrimeReportRequest,
  CreateCrimeReportRequest,
  FetchSOSAlertsParams,
  CreateSOSAlertRequest,
  AssignSOSOfficerRequest,
  ResolveSOSRequest,
  SOSStatsResponse,
  NearbyOfficersResponse,
  FetchNotificationsParams,
  AnalyticsFilterParams,
  CrimeTrendsResponse,
  DistrictComparisonResponse,
  SeasonalPatternsResponse,
  HotspotsResponse,
  HistoricalDataResponse,
  CombinedAnalyticsResponse,
  ForecastParams,
  ForecastResponse,
  PredictionStatsResponse,
  AllDistrictsForecastResponse,
  RiskScoreParams,
  RiskScoreResponse,
  RiskDistrictsResponse,
  RiskAllResponse,
  RiskHistoryResponse,
  DeploymentRecommendationsParams,
  DeploymentRecommendationsResponse,
  PredictionHistoryParams,
  PredictionHistoryResponse,
  FetchAuditLogsParams,
  UpdateSettingsRequest,
  SettingsResponse,
  SystemInfoResponse,
  ExportRequest,
  GenerateReportRequest,
  GeneratedReport,
  HeatmapFilterParams,
  HeatmapResponse,
  HeatmapStateResponse,
  HeatmapDistrictResponse,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth?.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// Single-flight refresh so parallel 401s only trigger one token request.
let refreshInFlight: Promise<string | null> | null = null;

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

/**
 * On 401: try to refresh the access token once, retry the original request,
 * and sign the user out locally if the refresh also fails.
 */
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  const url = typeof args === 'string' ? args : args.url;
  if (AUTH_PATHS.some(path => url.startsWith(path))) return result;

  const { refreshToken } = (api.getState() as RootState).auth ?? {};
  if (!refreshToken) {
    api.dispatch({ type: 'auth/logoutLocally' });
    return result;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as LoginResponse;
        if (!data?.accessToken || !data?.user) return null;
        api.dispatch({ type: 'auth/setCredentials', payload: data });
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  const newToken = await refreshInFlight;
  if (newToken) {
    result = await rawBaseQuery(args, api, extraOptions);
  } else {
    api.dispatch({ type: 'auth/logoutLocally' });
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'FIRs', 'Cases', 'Users', 'Officers', 'CrimeReports',
    'SOSAlerts', 'Notifications', 'Dashboard', 'Analytics',
    'Predictions', 'AuditLogs', 'Settings', 'HistoricalData',
  ],
  endpoints: builder => ({
    // ========================================================================
    // Auth Endpoints
    // ========================================================================
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: credentials => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    register: builder.mutation<LoginResponse, RegisterRequest>({
      query: payload => ({
        url: '/auth/register',
        method: 'POST',
        body: payload,
      }),
    }),
    refreshSession: builder.mutation<RefreshTokenResponse, { refreshToken: string }>({
      query: ({ refreshToken }) => ({
        url: '/auth/refresh',
        method: 'POST',
        body: { refreshToken },
      }),
    }),
    getCurrentUser: builder.query<User, void>({
      query: () => '/auth/me',
    }),
    logout: builder.mutation<SuccessResponse, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),

    // ========================================================================
    // Dashboard Endpoints
    // ========================================================================
    getDashboardStatistics: builder.query<DashboardStatisticsResponse, void>({
      query: () => '/dashboard/statistics',
      providesTags: ['Dashboard'],
    }),
    getDashboardRecentCrimes: builder.query<FIR[], number | void>({
      query: (limit = 10) => `/dashboard/recent-crimes?limit=${limit}`,
      providesTags: ['Dashboard'],
    }),
    getDashboardDistrictAnalysis: builder.query<DistrictAnalysis[], void>({
      query: () => '/dashboard/district-analysis',
      providesTags: ['Dashboard'],
    }),
    getDashboardCrimeTypeBreakdown: builder.query<CrimeTypeBreakdown[], void>({
      query: () => '/dashboard/crime-type-breakdown',
      providesTags: ['Dashboard'],
    }),
    getDashboardTrends: builder.query<TrendData[], string | void>({
      query: (period = '30d') => `/dashboard/trends?period=${period}`,
      providesTags: ['Dashboard'],
    }),

    // ========================================================================
    // FIR Endpoints
    // ========================================================================
    fetchFIRs: builder.query<PaginatedResponse<FIR>, FetchFIRsParams>({
      query: params => ({
        url: '/firs',
        params,
      }),
      providesTags: ['FIRs'],
    }),
    fetchFIRById: builder.query<FIR, string>({
      query: id => `/firs/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'FIRs', id }],
    }),
    createFIR: builder.mutation<FIR, CreateFIRRequest>({
      query: body => ({
        url: '/firs',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['FIRs', 'Dashboard'],
    }),
    updateFIR: builder.mutation<FIR, { id: string; data: UpdateFIRRequest }>({
      query: ({ id, data }) => ({
        url: `/firs/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FIRs', id }, 'FIRs', 'Dashboard'],
    }),
    assignFirOfficer: builder.mutation<FIR, { id: string; data: AssignOfficerRequest }>({
      query: ({ id, data }) => ({
        url: `/firs/${id}/assign`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FIRs', id }, 'FIRs'],
    }),
    closeFIR: builder.mutation<FIR, { id: string; data: CloseFIRRequest }>({
      query: ({ id, data }) => ({
        url: `/firs/${id}/close`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FIRs', id }, 'FIRs', 'Dashboard'],
    }),
    deleteFIR: builder.mutation<SuccessResponse, string>({
      query: id => ({
        url: `/firs/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['FIRs', 'Dashboard'],
    }),

    // ========================================================================
    // Case Endpoints
    // ========================================================================
    fetchCases: builder.query<PaginatedResponse<Case>, FetchCasesParams>({
      query: params => ({
        url: '/cases',
        params,
      }),
      providesTags: ['Cases'],
    }),
    fetchCaseById: builder.query<Case, string>({
      query: id => `/cases/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Cases', id }],
    }),
    createCase: builder.mutation<Case, CreateCaseRequest>({
      query: body => ({
        url: '/cases',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Cases', 'Dashboard'],
    }),
    updateCase: builder.mutation<Case, { id: string; data: UpdateCaseRequest }>({
      query: ({ id, data }) => ({
        url: `/cases/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Cases', id }, 'Cases', 'Dashboard'],
    }),
    deleteCase: builder.mutation<SuccessResponse, string>({
      query: id => ({
        url: `/cases/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Cases', 'Dashboard'],
    }),

    // ========================================================================
    // User Endpoints
    // ========================================================================
    fetchUsers: builder.query<PaginatedResponse<User>, FetchUsersParams>({
      query: params => ({
        url: '/users',
        params,
      }),
      providesTags: ['Users'],
    }),
    fetchUserById: builder.query<User, string>({
      query: id => `/users/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Users', id }],
    }),
    fetchUserStats: builder.query<{ total: number; active: number; suspended: number; inactive: number; pending: number; training: number; roles: Record<string, number> }, void>({
      query: () => '/users/stats',
      providesTags: ['Users'],
    }),
    createUser: builder.mutation<User, CreateUserRequest>({
      query: body => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Users'],
    }),
    updateUser: builder.mutation<User, { id: string; data: UpdateUserRequest }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Users', id }, 'Users'],
    }),
    deleteUser: builder.mutation<SuccessResponse, string>({
      query: id => ({
        url: `/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Users'],
    }),

    // ========================================================================
    // Officer Endpoints
    // ========================================================================
    fetchOfficers: builder.query<PaginatedResponse<Officer>, FetchOfficersParams>({
      query: params => ({
        url: '/officers',
        params,
      }),
      providesTags: ['Officers'],
    }),
    fetchOfficerById: builder.query<Officer, string>({
      query: id => `/officers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Officers', id }],
    }),
    createOfficer: builder.mutation<Officer, CreateOfficerRequest>({
      query: body => ({
        url: '/officers',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Officers'],
    }),
    updateOfficer: builder.mutation<Officer, { id: string; data: UpdateOfficerRequest }>({
      query: ({ id, data }) => ({
        url: `/officers/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Officers', id }, 'Officers'],
    }),
    deleteOfficer: builder.mutation<SuccessResponse, string>({
      query: id => ({
        url: `/officers/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Officers'],
    }),

    // ========================================================================
    // Tracking Endpoints
    // ========================================================================
    fetchTrackingStats: builder.query<TrackingStatsResponse, void>({
      query: () => '/tracking/stats',
      providesTags: ['Officers'],
    }),
    fetchTrackingOfficers: builder.query<PaginatedResponse<Officer>, FetchTrackingOfficersParams>({
      query: params => ({
        url: '/tracking/officers',
        params,
      }),
      providesTags: ['Officers'],
    }),
    updateOfficerStatus: builder.mutation<Officer, { id: string; data: UpdateOfficerStatusRequest }>({
      query: ({ id, data }) => ({
        url: `/tracking/officers/${id}/status`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Officers', id }, 'Officers', 'Dashboard'],
    }),
    updateOfficerLocation: builder.mutation<Officer, { id: string; data: UpdateOfficerLocationRequest }>({
      query: ({ id, data }) => ({
        url: `/tracking/officers/${id}/location`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Officers', id }, 'Officers'],
    }),
    assignOfficerToUnit: builder.mutation<Officer, { id: string; data: AssignOfficerToUnitRequest }>({
      query: ({ id, data }) => ({
        url: `/tracking/officers/${id}/assign`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Officers', id }, 'Officers', 'Dashboard'],
    }),

    // ========================================================================
    // Crime Report Endpoints
    // ========================================================================
    fetchCrimeReports: builder.query<PaginatedResponse<CrimeReport>, FetchCrimeReportsParams>({
      query: params => ({
        url: '/crime-reports',
        params,
      }),
      providesTags: ['CrimeReports'],
    }),
    fetchCrimeReportById: builder.query<CrimeReport, string>({
      query: id => `/crime-reports/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'CrimeReports', id }],
    }),
    createCrimeReport: builder.mutation<CrimeReport, CreateCrimeReportRequest>({
      query: body => ({
        url: '/crime-reports',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CrimeReports', 'Dashboard', 'Notifications'],
    }),
    approveCrimeReport: builder.mutation<CrimeReport, { id: string; data: ApproveCrimeReportRequest }>({
      query: ({ id, data }) => ({
        url: `/crime-reports/${id}/approve`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CrimeReports', id }, 'CrimeReports', 'Dashboard', 'FIRs'],
    }),
    rejectCrimeReport: builder.mutation<CrimeReport, { id: string; data: RejectCrimeReportRequest }>({
      query: ({ id, data }) => ({
        url: `/crime-reports/${id}/reject`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CrimeReports', id }, 'CrimeReports'],
    }),
    reviewCrimeReport: builder.mutation<CrimeReport, string>({
      query: id => ({
        url: `/crime-reports/${id}/review`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'CrimeReports', id }, 'CrimeReports'],
    }),
    assignCrimeReport: builder.mutation<CrimeReport, { id: string; officerId: string }>({
      query: ({ id, officerId }) => ({
        url: `/crime-reports/${id}/assign`,
        method: 'PATCH',
        body: { officerId },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CrimeReports', id }, 'CrimeReports'],
    }),
    requestInfoCrimeReport: builder.mutation<CrimeReport, { id: string; message: string }>({
      query: ({ id, message }) => ({
        url: `/crime-reports/${id}/request-info`,
        method: 'PATCH',
        body: { message },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CrimeReports', id }, 'CrimeReports'],
    }),
    archiveCrimeReport: builder.mutation<CrimeReport, string>({
      query: id => ({
        url: `/crime-reports/${id}/archive`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'CrimeReports', id }, 'CrimeReports'],
    }),
    deleteCrimeReport: builder.mutation<SuccessResponse, string>({
      query: id => ({
        url: `/crime-reports/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['CrimeReports', 'Dashboard'],
    }),

    // ========================================================================
    // SOS Alert Endpoints
    // ========================================================================
    fetchSOSAlerts: builder.query<PaginatedResponse<SOSAlert>, FetchSOSAlertsParams>({
      query: params => ({
        url: '/sos-alerts',
        params,
      }),
      providesTags: ['SOSAlerts'],
    }),
    fetchSOSAlertById: builder.query<SOSAlert, string>({
      query: id => `/sos-alerts/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'SOSAlerts', id }],
    }),
    fetchSOSStats: builder.query<SOSStatsResponse, void>({
      query: () => '/sos-alerts/stats',
      providesTags: ['SOSAlerts'],
    }),
    fetchNearbyOfficers: builder.query<NearbyOfficersResponse, { latitude: number; longitude: number; maxDistance?: number }>({
      query: params => ({
        url: '/sos-alerts/nearby',
        params,
      }),
      providesTags: ['Officers'],
    }),
    createSOSAlert: builder.mutation<SOSAlert, CreateSOSAlertRequest>({
      query: data => ({
        url: '/sos-alerts',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['SOSAlerts', 'Dashboard'],
    }),
    assignSOSOfficer: builder.mutation<SOSAlert, { id: string; data: AssignSOSOfficerRequest }>({
      query: ({ id, data }) => ({
        url: `/sos-alerts/${id}/assign`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SOSAlerts', id }, 'SOSAlerts', 'Dashboard'],
    }),
    resolveSOSAlert: builder.mutation<SOSAlert, { id: string; data: ResolveSOSRequest }>({
      query: ({ id, data }) => ({
        url: `/sos-alerts/${id}/resolve`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SOSAlerts', id }, 'SOSAlerts', 'Dashboard'],
    }),
    cancelSOSAlert: builder.mutation<SOSAlert, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/sos-alerts/${id}/cancel`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SOSAlerts', id }, 'SOSAlerts', 'Dashboard'],
    }),
    playSOSAlertSound: builder.mutation<SOSAlert, string>({
      query: id => ({
        url: `/sos-alerts/${id}/sound`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'SOSAlerts', id }, 'SOSAlerts'],
    }),
    contactSOSAlertCitizen: builder.mutation<SOSAlert, string>({
      query: id => ({
        url: `/sos-alerts/${id}/contact`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'SOSAlerts', id }, 'SOSAlerts'],
    }),

    // ========================================================================
    // Notification Endpoints
    // ========================================================================
    fetchNotifications: builder.query<PaginatedResponse<Notification>, FetchNotificationsParams>({
      query: params => ({
        url: '/notifications',
        params,
      }),
      providesTags: ['Notifications'],
    }),
    markNotificationRead: builder.mutation<Notification, string>({
      query: id => ({
        url: `/notifications/${id}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: builder.mutation<SuccessResponse, void>({
      query: () => ({
        url: '/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: ['Notifications'],
    }),
    getUnreadNotificationCount: builder.query<number, void>({
      query: () => '/notifications/unread-count',
      providesTags: ['Notifications'],
    }),

    // ========================================================================
    // Analytics Endpoints
    // ========================================================================
    getCrimeTrends: builder.query<CrimeTrendsResponse, AnalyticsFilterParams>({
      query: params => ({
        url: '/analytics/trends',
        params,
      }),
      providesTags: ['Analytics'],
    }),
    getDistrictComparison: builder.query<DistrictComparisonResponse, void>({
      query: () => '/analytics/district-comparison',
      providesTags: ['Analytics'],
    }),
    getSeasonalPatterns: builder.query<SeasonalPatternsResponse, void>({
      query: () => '/analytics/seasonal-patterns',
      providesTags: ['Analytics'],
    }),
    getHotspots: builder.query<HotspotsResponse, Record<string, string> | void>({
      query: (params) => ({
        url: '/analytics/hotspots',
        params: params || {},
      }),
      providesTags: ['Analytics'],
    }),
    getHotspotDetail: builder.query<HotspotDetail, string>({
      query: (id) => `/analytics/hotspots/${encodeURIComponent(id)}`,
      providesTags: ['Analytics'],
    }),
    getHistoricalData: builder.query<HistoricalDataResponse, void>({
      query: () => '/analytics/historical',
      providesTags: ['HistoricalData'],
    }),
    getCombinedAnalytics: builder.query<CombinedAnalyticsResponse, AnalyticsFilterParams>({
      query: params => ({
        url: '/analytics/combined',
        params,
      }),
      providesTags: ['Analytics', 'HistoricalData'],
    }),

    // ========================================================================
    // Prediction Endpoints
    // ========================================================================
    getPredictionStats: builder.query<PredictionStatsResponse, void>({
      query: () => '/predictions/stats',
      providesTags: ['Predictions'],
    }),
    getForecast: builder.query<ForecastResponse, ForecastParams>({
      query: params => ({
        url: '/predictions/forecast',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    getAllDistrictsForecast: builder.query<AllDistrictsForecastResponse, { crimeType?: string; period?: string }>({
      query: params => ({
        url: '/predictions/all-districts',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    getRiskScore: builder.query<RiskScoreResponse, RiskScoreParams>({
      query: params => ({
        url: '/risk/score',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    getRiskDistricts: builder.query<RiskDistrictsResponse, void>({
      query: () => '/risk/districts',
      providesTags: ['Predictions'],
    }),
    getRiskAll: builder.query<RiskAllResponse, void>({
      query: () => '/risk/all',
      providesTags: ['Predictions'],
    }),
    getRiskHistory: builder.query<RiskHistoryResponse, { district: string }>({
      query: params => ({
        url: '/risk/history',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    getDeploymentRecommendations: builder.query<DeploymentRecommendationsResponse, DeploymentRecommendationsParams>({
      query: params => ({
        url: '/predictions/deployment',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    getPredictionHistory: builder.query<PredictionHistoryResponse, PredictionHistoryParams>({
      query: params => ({
        url: '/predictions/history',
        params,
      }),
      providesTags: ['Predictions'],
    }),
    exportForecast: builder.query<string, { district: string; crimeType: string; period: string }>({
      query: params => ({
        url: '/forecast/export',
        params,
        responseHandler: (res) => res.text(),
      }),
    }),

    // ========================================================================
    // Heatmap Endpoints
    // ========================================================================
    getHeatmapData: builder.query<HeatmapResponse, HeatmapFilterParams>({
      query: params => ({
        url: '/heatmap',
        params,
      }),
      providesTags: ['Analytics'],
    }),
    getHeatmapStateData: builder.query<HeatmapStateResponse, string>({
      query: stateName => `/heatmap/state/${encodeURIComponent(stateName)}`,
      providesTags: ['Analytics'],
    }),
    getHeatmapDistrictData: builder.query<HeatmapDistrictResponse, string>({
      query: districtName => `/heatmap/district/${encodeURIComponent(districtName)}`,
      providesTags: ['Analytics'],
    }),

    // ========================================================================
    // Audit Log Endpoints
    // ========================================================================
    fetchAuditLogs: builder.query<PaginatedResponse<AuditLog>, FetchAuditLogsParams>({
      query: params => ({
        url: '/audit-logs',
        params,
      }),
      providesTags: ['AuditLogs'],
    }),

    // ========================================================================
    // Settings Endpoints
    // ========================================================================
    getSettings: builder.query<SettingsResponse, void>({
      query: () => '/settings',
      providesTags: ['Settings'],
    }),
    updateSettings: builder.mutation<SuccessResponse, UpdateSettingsRequest>({
      query: body => ({
        url: '/settings',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings'],
    }),
    updateNotificationSettings: builder.mutation<SuccessResponse, Record<string, boolean>>({
      query: body => ({
        url: '/settings/notifications',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings'],
    }),
    updateSecuritySettings: builder.mutation<SuccessResponse, Partial<SettingsResponse['security']>>({
      query: body => ({
        url: '/settings/security',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings'],
    }),
    updateIntegrationSettings: builder.mutation<SuccessResponse, Record<string, unknown>>({
      query: body => ({
        url: '/settings/integrations',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings'],
    }),
    testIntegration: builder.mutation<{ success: boolean; status: string }, string>({
      query: key => ({
        url: `/settings/integrations/${key}/test`,
        method: 'POST',
      }),
    }),
    getSystemInfo: builder.query<SystemInfoResponse, void>({
      query: () => '/settings/system-info',
      providesTags: ['Settings'],
    }),

    // ========================================================================
    // Export Endpoints
    // ========================================================================
    exportData: builder.mutation<Blob, ExportRequest>({
      query: body => ({
        url: '/export',
        method: 'POST',
        body,
        responseHandler: response => response.blob(),
      }),
    }),
    generateReport: builder.mutation<Blob, GenerateReportRequest>({
      query: body => ({
        url: '/reports/generate',
        method: 'POST',
        body,
        responseHandler: response => response.blob(),
      }),
    }),
    getReportHistory: builder.query<GeneratedReport[], void>({
      query: () => '/reports/history',
    }),
    downloadReport: builder.mutation<Blob, string>({
      query: id => ({
        url: `/reports/download/${id}`,
        method: 'GET',
        responseHandler: response => response.blob(),
      }),
    }),
  }),
});

export const {
  // Auth
  useLoginMutation,
  useRefreshSessionMutation,
  useGetCurrentUserQuery,
  useLogoutMutation,
  useRegisterMutation,
  // Dashboard
  useGetDashboardStatisticsQuery,
  useGetDashboardRecentCrimesQuery,
  useGetDashboardDistrictAnalysisQuery,
  useGetDashboardCrimeTypeBreakdownQuery,
  useGetDashboardTrendsQuery,
  // FIRs
  useFetchFIRsQuery,
  useFetchFIRByIdQuery,
  useCreateFIRMutation,
  useUpdateFIRMutation,
  useAssignFirOfficerMutation,
  useCloseFIRMutation,
  useDeleteFIRMutation,
  // Cases
  useFetchCasesQuery,
  useFetchCaseByIdQuery,
  useCreateCaseMutation,
  useUpdateCaseMutation,
  useDeleteCaseMutation,
  // Users
  useFetchUsersQuery,
  useFetchUserByIdQuery,
  useFetchUserStatsQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  // Officers
  useFetchOfficersQuery,
  useFetchOfficerByIdQuery,
  useCreateOfficerMutation,
  useUpdateOfficerMutation,
  useDeleteOfficerMutation,
  // Tracking
  useFetchTrackingStatsQuery,
  useFetchTrackingOfficersQuery,
  useUpdateOfficerStatusMutation,
  useUpdateOfficerLocationMutation,
  useAssignOfficerToUnitMutation,
  // Crime Reports
  useFetchCrimeReportsQuery,
  useFetchCrimeReportByIdQuery,
  useCreateCrimeReportMutation,
  useApproveCrimeReportMutation,
  useRejectCrimeReportMutation,
  useReviewCrimeReportMutation,
  useAssignCrimeReportMutation,
  useRequestInfoCrimeReportMutation,
  useArchiveCrimeReportMutation,
  useDeleteCrimeReportMutation,
  // SOS Alerts
  useFetchSOSAlertsQuery,
  useFetchSOSAlertByIdQuery,
  useFetchSOSStatsQuery,
  useFetchNearbyOfficersQuery,
  useCreateSOSAlertMutation,
  useAssignSOSOfficerMutation,
  useResolveSOSAlertMutation,
  useCancelSOSAlertMutation,
  usePlaySOSAlertSoundMutation,
  useContactSOSAlertCitizenMutation,
  // Notifications
  useFetchNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetUnreadNotificationCountQuery,
  // Analytics
  useGetCrimeTrendsQuery,
  useGetDistrictComparisonQuery,
  useGetSeasonalPatternsQuery,
  useGetHotspotsQuery,
  useGetHotspotDetailQuery,
  useGetHistoricalDataQuery,
  useGetCombinedAnalyticsQuery,
    // Predictions
    useGetPredictionStatsQuery,
    useGetForecastQuery,
    useGetAllDistrictsForecastQuery,
    useGetRiskScoreQuery,
    useGetRiskDistrictsQuery,
    useGetRiskAllQuery,
    useGetRiskHistoryQuery,
    useGetDeploymentRecommendationsQuery,
    useGetPredictionHistoryQuery,
    useExportForecastQuery,
    // Heatmap
    useGetHeatmapDataQuery,
    useGetHeatmapStateDataQuery,
    useGetHeatmapDistrictDataQuery,
  // Audit Logs
  useFetchAuditLogsQuery,
  // Settings
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useUpdateNotificationSettingsMutation,
  useUpdateSecuritySettingsMutation,
  useUpdateIntegrationSettingsMutation,
  useTestIntegrationMutation,
  useGetSystemInfoQuery,
  // Export & Reports
  useExportDataMutation,
  useGenerateReportMutation,
  useGetReportHistoryQuery,
  useDownloadReportMutation,
} = apiSlice;
