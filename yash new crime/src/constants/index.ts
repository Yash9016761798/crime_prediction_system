// Application constants

export const APP_NAME = 'Crime Prediction & Analysis System';
export const APP_VERSION = '1.0.0';

// API Configuration
export const API_TIMEOUT = 30000; // 30 seconds
export const REFRESH_INTERVAL = 30000; // 30 seconds for dashboard auto-refresh

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Status options
export const FIR_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Under Investigation', value: 'investigation' },
  { label: 'Solved', value: 'solved' },
  { label: 'Closed', value: 'closed' },
];

export const CASE_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Investigation', value: 'investigation' },
  { label: 'Solved', value: 'solved' },
  { label: 'Archived', value: 'archived' },
  { label: 'Closed', value: 'closed' },
];

export const CASE_PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

export const CASE_CATEGORY_OPTIONS = [
  'Property Crime',
  'Violent Crime',
  'Cyber Crime',
  'Financial Crime',
  'Drug Offense',
  'Organized Crime',
  'Cold Case',
  'Other',
];

export const EVIDENCE_TYPE_OPTIONS = [
  'Photo',
  'Video',
  'Audio',
  'Document',
  'Physical',
  'Digital',
  'Other',
];

export const FIR_SEVERITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

export const FIR_PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

export const USER_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Pending Verification', value: 'pending' },
  { label: 'Training', value: 'training' },
];

export const OFFICER_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'On Leave', value: 'on-leave' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Training', value: 'training' },
];

export const CRIME_REPORT_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Requested Info', value: 'requested_info' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Archived', value: 'archived' },
];

export const SOS_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Cancelled', value: 'cancelled' },
];

export const NOTIFICATION_TYPES = [
  { label: 'SOS Alert', value: 'sos' },
  { label: 'Crime Report', value: 'crime_report' },
  { label: 'Prediction', value: 'prediction' },
  { label: 'System', value: 'system' },
  { label: 'Assignment', value: 'assignment' },
];

export const USER_ROLES = [
  { label: 'Citizen', value: 'citizen' },
  { label: 'Admin', value: 'admin' },
  { label: 'Officer', value: 'officer' },
  { label: 'Super Admin', value: 'super_admin' },
  { label: 'Viewer', value: 'viewer' },
];

// Crime types (can be extended)
export const CRIME_TYPES = [
  'Theft',
  'Robbery',
  'Assault',
  'Murder',
  'Kidnapping',
  'Burglary',
  'Vehicle Theft',
  'Fraud',
  'Cybercrime',
  'Drug Offense',
  'Vandalism',
  'Domestic Violence',
  'Other',
];

// Officer ranks
export const OFFICER_RANKS = [
  'Constable',
  'Head Constable',
  'Assistant Sub-Inspector',
  'Sub-Inspector',
  'Inspector',
  'Deputy Superintendent',
  'Superintendent',
  'Deputy Inspector General',
  'Inspector General',
];

// Map configuration
export const DEFAULT_MAP_CENTER: [number, number] = [20.5937, 78.9629]; // India center
export const DEFAULT_MAP_ZOOM = 5;
export const DETAIL_MAP_ZOOM = 13;

// Date formats
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const DISPLAY_DATE_FORMAT = 'MMM DD, YYYY';
export const DISPLAY_DATETIME_FORMAT = 'MMM DD, YYYY HH:mm';

// Debounce delay for search inputs
export const SEARCH_DEBOUNCE_DELAY = 300; // milliseconds
