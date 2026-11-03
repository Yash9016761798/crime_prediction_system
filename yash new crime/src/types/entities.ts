// Entity type definitions for the crime management system

// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'citizen' | 'admin' | 'officer' | 'super_admin' | 'viewer';
export type UserStatus = 'active' | 'suspended' | 'inactive' | 'pending' | 'training';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  role: UserRole;
  status: UserStatus;
  registrationDate: Date;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Officer Types
// ============================================================================

export type OfficerStatus = 'active' | 'inactive' | 'on-leave' | 'suspended' | 'training' | 'offline';
export type UnitType = 'patrol' | 'vehicle' | 'motorcycle' | 'bike' | 'foot';
export type TrackingMode = 'live' | 'demo';

export interface OfficerLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
  trackingMode?: TrackingMode;
}

export interface Officer {
  id: string;
  userId?: string;
  badgeNumber: string;
  name: string;
  rank: string;
  district: string;
  phone: string;
  specialization: string[];
  status: OfficerStatus;
  unitType: UnitType;
  currentLocation?: OfficerLocation;
  assignedFIRs: string[];
  assignedCases: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// FIR Types
// ============================================================================

export type FIRStatus = 'pending' | 'investigation' | 'solved' | 'closed';
export type FIRSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FIRPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Victim {
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  address?: string;
}

export interface Suspect {
  name: string;
  alias?: string;
  description?: string;
  age?: number;
  gender?: string;
}

export interface Witness {
  name: string;
  contact?: string;
  statement?: string;
}

export interface FIR {
  id: string;
  firNumber: string;
  crimeType: string;
  severity: FIRSeverity;
  priority: FIRPriority;
  incidentDate: Date;
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
  victims?: Victim[];
  suspects?: Suspect[];
  witnesses?: Witness[];
  description: string;
  status: FIRStatus;
  assignedOfficerId?: string;
  assignedOfficer?: Officer;
  createdBy?: string;
  closureReason?: string;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// ============================================================================
// Case Types
// ============================================================================

export type CaseStatus = 'active' | 'investigation' | 'solved' | 'archived' | 'closed';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface CaseSuspect {
  name: string;
  alias?: string;
  description?: string;
  age?: number;
  gender?: string;
  status: string;
  arrestedAt?: Date;
}

export interface CaseWitness {
  name: string;
  contact?: string;
  statement?: string;
  recordedAt?: Date;
}

export interface CaseEvidence {
  id: string;
  type: string;
  name: string;
  description?: string;
  url?: string;
  addedBy?: string;
  addedAt: Date;
}

export interface CaseNote {
  id: string;
  author: string;
  content: string;
  createdAt: Date;
}

export interface CaseTimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: Date;
}

export interface Case {
  id: string;
  caseNumber: string;
  name: string;
  description?: string;
  priority: CasePriority;
  category?: string;
  crimeType?: string;
  crimeLocation?: string;
  policeStation?: string;
  district?: string;
  state?: string;
  status: CaseStatus;
  leadOfficerId?: string;
  leadOfficer?: Officer;
  linkedFIRs: FIR[];
  linkedFIRId?: string;
  assignedOfficers: Officer[];
  supportingOfficerIds?: string[];
  investigationStartDate?: Date;
  expectedCompletionDate?: Date;
  suspects?: CaseSuspect[];
  witnesses?: CaseWitness[];
  evidence?: CaseEvidence[];
  notes?: CaseNote[];
  timeline?: CaseTimelineEvent[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// ============================================================================
// Crime Report Types
// ============================================================================

export type CrimeReportStatus = 'pending' | 'under_review' | 'requested_info' | 'approved' | 'rejected' | 'archived';

export interface CrimeReport {
  id: string;
  userId?: string;
  user?: User;
  crimeType: string;
  crimeCategory?: string;
  incidentDate: Date;
  incidentTime?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  district: string;
  state?: string;
  policeStation?: string;
  description: string;
  evidenceUrls: string[];
  evidence?: { id: string; type: string; name: string; url: string; }[];
  status: CrimeReportStatus;
  assignedOfficerId?: string;
  assignedOfficer?: any;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  requestInfoMessage?: string;
  createdFIRId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SOS Alert Types
// ============================================================================

export type SOSAlertStatus = 'pending' | 'assigned' | 'in-progress' | 'resolved' | 'cancelled';
export type SOSAlertType = 'emergency' | 'medical' | 'fire' | 'accident' | 'harassment' | 'other';
export type SOSAlertPriority = 'critical' | 'high' | 'medium' | 'low';

export interface SOSAlert {
  id: string;
  userId?: string;
  user?: User;
  alertType: SOSAlertType;
  priority: SOSAlertPriority;
  description?: string;
  latitude: number;
  longitude: number;
  locationAddress?: string;
  district?: string;
  policeStation?: string;
  status: SOSAlertStatus;
  assignedOfficerId?: string;
  assignedOfficer?: Officer;
  assignedAt?: Date;
  resolvedAt?: Date;
  responseTime?: number;
  resolutionNotes?: string;
  soundPlayed?: boolean;
  contacted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'sos' | 'crime_report' | 'prediction' | 'system' | 'assignment';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  priority: NotificationPriority;
  createdAt: Date;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export interface AuditLog {
  id: string;
  userId?: string;
  user?: User;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ============================================================================
// Historical Crime Types
// ============================================================================

export interface HistoricalCrime {
  id: number;
  state: string;
  district: string;
  year: number;
  crimeType: string;
  count: number;
  createdAt: Date;
}

// ============================================================================
// Dashboard Statistics Types
// ============================================================================

export interface DashboardStatistics {
  totalFIRs: number;
  activeCases: number;
  pendingReports: number;
  activeOfficers: number;
  sosAlerts: number;
  solvedCases: number;
  historicalCrimes: number;
  todayIncidents: number;
}

// ============================================================================
// Prediction and Analytics Types
// ============================================================================

export type TrendDirection = 'increasing' | 'decreasing' | 'stable';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PredictionResult {
  district: string;
  crimeType: string;
  month: string;
  forecastedCount: number;
  confidence: number; // 0-100
  trendDirection: TrendDirection;
  percentageChange: number;
  peakDays: string[];
  contributingFactors: string[];
  historicalAverage: number;
  recentTrend: number;
  recommendations: {
    officerCount: number;
    patrolShifts: string[];
    priorityAreas: string[];
    preventiveMeasures: string[];
  };
}

export interface RiskScore {
  district: string;
  score: number; // 0-100
  level: RiskLevel;
  historicalRate: number;
  recentIncidents: number;
  contributingFactors?: Array<{
    factor: string;
    weight: number;
    maxWeight?: number;
  }>;
  lastUpdated: Date;
}

// ============================================================================
// Chart and Visualization Data Types
// ============================================================================

export interface DistrictAnalysis {
  district: string;
  count: number;
  change?: number; // percentage change
  trend?: TrendDirection;
}

export interface CrimeTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
}

export interface TrendData {
  date: string;
  count: number;
  predicted?: boolean;
}

export interface HotspotData {
  id: string;
  latitude: number;
  longitude: number;
  intensity: number;
  district: string;
  state: string;
  crimeCount: number;
  dominantCrimeType: string;
  riskLevel: string;
  yoyChange: number;
  trend: string;
  topCrimes: { type: string; count: number; percentage: number }[];
  riskScore: number;
  prediction: string;
  recommendation: string;
  lastUpdated: string;
}

export interface HotspotDetail {
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  totalCrimes: number;
  latestYearCount: number;
  yoyChange: number;
  last30Days: number;
  last12Months: number;
  crimeBreakdown: { type: string; count: number; percentage: number }[];
  yearTrend: { year: number; count: number }[];
  riskScore: number;
  intensity: number;
  prediction: string;
  recommendation: string;
  fir: { active: number; pending: number; solved: number; officerAssigned: string };
  sosAlerts: { active: number; lastSOS: string; emergencyFrequency: string };
  areaInfo: { state: string; district: string; policeStation: string; city: string; coordinates: { lat: number; lng: number } };
}

// ============================================================================
// User Settings Types
// ============================================================================

export type Theme = 'light' | 'dark';

export interface NotificationSettings {
  sos: boolean;
  crime_report: boolean;
  prediction: boolean;
  system: boolean;
  assignment: boolean;
}

export interface UserSettings {
  userId: string;
  theme: Theme;
  notificationsEnabled: NotificationSettings;
  refreshInterval: number; // in seconds
  defaultPageSize: number;
  createdAt: Date;
  updatedAt: Date;
}
