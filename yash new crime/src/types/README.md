# TypeScript Type Definitions

This directory contains comprehensive TypeScript type definitions for the Crime Prediction & Analysis System Admin Dashboard.

## File Structure

### `index.ts`
Main entry point that re-exports all types from other modules. Import types from this file in your components:

```typescript
import type { User, FIR, PaginatedResponse, RootState } from '@/types';
```

### `entities.ts`
Core entity type definitions representing database models and business objects:

- **User Types**: User, UserRole, UserStatus
- **Officer Types**: Officer, OfficerStatus, OfficerLocation
- **FIR Types**: FIR, FIRStatus
- **Case Types**: Case, CaseStatus, CasePriority
- **Crime Report Types**: CrimeReport, CrimeReportStatus
- **SOS Alert Types**: SOSAlert, SOSAlertStatus
- **Notification Types**: Notification, NotificationType, NotificationPriority
- **Audit Log Types**: AuditLog
- **Historical Crime Types**: HistoricalCrime
- **Dashboard Types**: DashboardStatistics
- **Prediction Types**: PredictionResult, RiskScore, TrendDirection, RiskLevel
- **Visualization Types**: DistrictAnalysis, CrimeTypeBreakdown, TrendData, HotspotData
- **Settings Types**: UserSettings, Theme, NotificationSettings

### `api.ts`
API request and response type definitions for all backend endpoints:

- **Common API Types**: PaginationParams, PaginatedResponse, ApiError, ValidationError
- **Authentication API**: LoginRequest/Response, RefreshToken, ForgotPassword, ResetPassword
- **Dashboard API**: DashboardStatisticsResponse, RecentCrimesResponse, DistrictAnalysisResponse
- **FIR API**: FetchFIRsParams, CreateFIRRequest, UpdateFIRRequest, AssignOfficerRequest
- **Case API**: FetchCasesParams, CreateCaseRequest, UpdateCaseRequest, AddEvidenceRequest
- **User API**: FetchUsersParams, CreateUserRequest, UpdateUserRequest, BulkSuspendRequest
- **Officer API**: FetchOfficersParams, CreateOfficerRequest, TransferOfficerRequest
- **Crime Report API**: FetchCrimeReportsParams, ApproveCrimeReportRequest, RejectCrimeReportRequest
- **SOS Alert API**: FetchSOSAlertsParams, AssignSOSOfficerRequest, ResolveSOSRequest
- **Notification API**: FetchNotificationsParams, UnreadCountResponse
- **Analytics API**: CrimeTrendsResponse, DistrictComparisonResponse, SeasonalPatternsResponse
- **Prediction API**: ForecastParams, RiskScoreParams, DeploymentRecommendationsResponse
- **Audit Log API**: FetchAuditLogsParams, ExportAuditLogsRequest
- **Settings API**: UpdateSettingsRequest, SystemInfoResponse
- **Export API**: ExportRequest, GenerateReportRequest
- **WebSocket Events**: WebSocketMessage, SOSAlertEvent, NotificationEvent, FIRUpdateEvent

### `state.ts`
Redux state management type definitions:

- **RootState**: Complete application state structure
- **AuthState**: Authentication and user session state
- **DashboardState**: Dashboard metrics and visualizations
- **FIRsState**: FIR management with filters, sorting, pagination, and selection
- **CasesState**: Case management state
- **UsersState**: User management state
- **OfficersState**: Officer management with live location tracking
- **CrimeReportsState**: Crime report review state
- **SOSAlertsState**: SOS alert monitoring with auto-refresh
- **NotificationsState**: Notification management
- **AnalyticsState**: Analytics filters and visualization data
- **PredictionsState**: Prediction results, risk scores, and deployment recommendations
- **SettingsState**: User settings and system information
- **UIState**: UI state including sidebar, modals, toasts, confirm dialogs

Each state includes comprehensive filter, sorting, and pagination configurations.

### `components.ts`
React component prop type definitions:

- **DataTable**: Universal table component with search, filter, sort, pagination
- **InsightCard**: Dashboard metric cards with trends and actions
- **FilterBar**: Reusable filter interface
- **FormModal**: Modal dialog for forms with validation
- **Charts**: LineChart, BarChart, PieChart props
- **Map Components**: Map, HeatmapLayer, MapMarker, MapLayer props
- **Drawer Components**: Generic drawer and entity-specific detail drawers
- **EmptyState**: Empty state display
- **LoadingSkeleton**: Loading placeholders
- **ConfirmDialog**: Confirmation dialogs
- **Toast**: Toast notifications
- **Navigation**: Sidebar, TopNavigation, MenuItem props
- **Dropdowns**: NotificationDropdown, ProfileDropdown props
- **Dashboard Components**: DashboardStats, RecentCrimesTable props
- **Prediction Components**: PredictionForm, ForecastResultCard, RecommendationsPanel props
- **Assignment Dialog**: Officer assignment dialog
- **Status Badge**: Status display badge
- **File Upload**: File upload component
- **Search Input**: Debounced search input
- **Pagination**: Pagination controls
- **Breadcrumbs**: Navigation breadcrumbs
- **Card**: Generic card component
- **Tabs**: Tab navigation
- **Timeline**: Activity timeline

### `common.ts`
Common utility types and type helpers:

- **Generic Utilities**: DeepPartial, RequireProps, PartialProps, KeysOfType, Nullable
- **Pagination**: PaginationParams, PaginatedResponse, CursorPagination
- **Filters**: FilterParams, SortParams
- **API Responses**: ApiResponse, ApiError, ValidationError
- **Date Range**: DateRange types
- **Location**: Coordinates, Location, BoundingBox
- **File Upload**: UploadedFile, FileUploadProgress
- **Chart Data**: ChartDataPoint, TimeSeriesDataPoint, ComparisonDataPoint
- **Async State**: LoadingState, AsyncState, AsyncStateWithTimestamp
- **Selection**: SelectionState
- **Form**: FormState, FormErrors, FormFieldValue
- **Search**: SearchParams, SearchResult
- **Notifications**: ToastNotification, NotificationVariant
- **Modal**: ModalConfig
- **Table**: TableColumn, TableAction
- **Menu**: MenuOption
- **Permission**: Permission, Role, RolePermissions
- **Audit**: AuditAction, EntityType
- **Statistics**: StatisticValue, TrendAnalysis
- **Export**: ExportFormat, ExportOptions
- **WebSocket**: WebSocketMessage, WebSocketStatus, WebSocketState
- **Theme**: ThemeMode, ThemeColors
- **Configuration**: AppConfig
- **Breakpoints**: Breakpoint, ResponsiveValue
- **Type Guards**: isApiError, isValidationError, isPaginatedResponse

## Usage Examples

### Importing Entity Types

```typescript
import type { User, FIR, Officer, Case } from '@/types';

const user: User = {
  id: '123',
  name: 'John Doe',
  email: 'john@example.com',
  // ...
};
```

### Importing API Types

```typescript
import type { 
  CreateFIRRequest, 
  PaginatedResponse, 
  FetchFIRsParams 
} from '@/types';

const createFIR = async (data: CreateFIRRequest) => {
  // API call
};

const getFIRs = async (
  params: FetchFIRsParams
): Promise<PaginatedResponse<FIR>> => {
  // API call
};
```

### Importing State Types

```typescript
import type { RootState, FIRsState } from '@/types';
import { useSelector } from 'react-redux';

const firs = useSelector((state: RootState) => state.firs);
```

### Importing Component Props

```typescript
import type { DataTableProps, InsightCardProps } from '@/types';

const MyTable: React.FC<DataTableProps<FIR>> = ({ 
  columns, 
  data, 
  loading 
}) => {
  // Component implementation
};
```

### Using Common Utility Types

```typescript
import type { DeepPartial, AsyncState, PaginationParams } from '@/types';

// Partial update of nested object
const updateUser = (userId: string, updates: DeepPartial<User>) => {
  // Update logic
};

// Async state wrapper
const [firState, setFirState] = useState<AsyncState<FIR>>({
  data: null,
  loading: false,
  error: null,
  status: 'idle'
});
```

## Type Safety Benefits

1. **Compile-time Validation**: Catch type errors before runtime
2. **Intellisense Support**: Better IDE autocomplete and documentation
3. **Refactoring Safety**: Confidently rename or restructure types
4. **API Contract**: Clear interface between frontend and backend
5. **Component Props**: Self-documenting component interfaces
6. **State Management**: Strongly-typed Redux store

## Best Practices

1. **Always use `type` imports** for better tree-shaking:
   ```typescript
   import type { User } from '@/types'; // Good
   import { User } from '@/types'; // Avoid
   ```

2. **Prefer interfaces over types** for object shapes (already followed in this codebase)

3. **Use union types** for constrained values:
   ```typescript
   type UserRole = 'citizen' | 'admin' | 'officer';
   ```

4. **Leverage utility types** instead of duplicating definitions:
   ```typescript
   type UpdateUserRequest = Partial<CreateUserRequest>;
   ```

5. **Document complex types** with JSDoc comments when needed

## Type Coverage

This type system covers:

- ✅ All entity models (Users, Officers, FIRs, Cases, Crime Reports, SOS Alerts, etc.)
- ✅ Complete API request/response types for all endpoints
- ✅ Redux state management types for all slices
- ✅ Component prop types for all major components
- ✅ Common utility types and helpers
- ✅ WebSocket event types
- ✅ Form validation types
- ✅ Chart and visualization types
- ✅ Map and location types
- ✅ File upload types
- ✅ Permission and role types
- ✅ Audit logging types
- ✅ Export and reporting types

## Requirements Validation

These type definitions satisfy the following requirements:

- **Req 36.2**: Comprehensive entity type definitions for all data models
- **Req 36.3**: API request/response types ensuring type-safe backend communication
- **Req 36.4**: State management types for centralized Redux store
- **Req 36.5**: Component prop types for reusable UI components
- **Req 36.6**: Type safety across all application layers

## Maintenance

When adding new features:

1. Add entity types to `entities.ts`
2. Add API types to `api.ts`
3. Add state types to `state.ts`
4. Add component prop types to `components.ts`
5. Export new types from `index.ts`
6. Update this README with new type categories

## Related Documentation

- [Redux Store Structure](../store/README.md) - How state types are used
- [API Client Documentation](../services/README.md) - How API types are used
- [Component Library](../components/README.md) - How component prop types are used
