# Implementation Plan: Admin Dashboard Implementation

## Overview

This implementation plan transforms the prototype admin dashboard into a fully functional crime management and prediction system. The system integrates historical crime data from the dstrIPC_1.csv dataset with live operational data to provide real-time analytics, predictive insights, case management, and emergency response capabilities.

**Tech Stack**: React 19, TypeScript, Vite, Redux Toolkit, Recharts, Leaflet, Tailwind CSS

**Implementation Approach**: Phased rollout prioritizing critical fixes and core functionality first, then adding advanced features and optimizations.

**Priority Order**:
- 🔴 P1: Fix dead buttons and navigation
- 🔴 P2: Search, filters, sorting, pagination  
- 🔴 P3: CRUD operations
- 🟠 P4: Shared state management
- 🟠 P5: API integration
- 🟡 P6: AI predictions
- 🟡 P7: Real-time features
- 🟢 P8: Performance, accessibility, security

## Tasks

### Phase 1: Project Setup and Foundation

- [x] 1. Set up project structure and core dependencies
  - Create project with Vite + React 19 + TypeScript
  - Install and configure dependencies: Redux Toolkit, React Router v6, Recharts, Leaflet, Tailwind CSS, Axios
  - Set up ESLint, Prettier, and TypeScript configuration
  - Create directory structure following feature-based organization
  - Set up Vitest for testing with React Testing Library
  - _Requirements: Foundation for all features_

- [ ] 2. Create shared TypeScript type definitions
  - Define entity interfaces (User, Officer, FIR, Case, CrimeReport, SOSAlert, Notification, AuditLog, HistoricalCrime)
  - Define API request/response types
  - Define state management types (RootState, slices)
  - Define component prop types
  - _Requirements: 36.2, 36.3, 36.4, 36.5, 36.6_

- [ ] 3. Set up Redux store and middleware
  - Configure Redux store with slices for auth, dashboard, firs, cases, users, officers, notifications, ui
  - Set up RTK Query for API caching and data fetching
  - Configure middleware for logging and error handling
  - Implement store persistence using redux-persist for offline capability
  - _Requirements: 21.1, 21.2, 21.3_

- [ ]* 3.1 Write property test for state management
  - **Property 12: API Response Caching**
  - **Validates: Requirements 21.4**

### Phase 2: Authentication and Layout (P1)

- [ ] 4. Implement authentication system
  - [ ] 4.1 Create login page with form validation
    - Build LoginPage component with email and password fields
    - Implement client-side validation (email format, required fields)
    - Add loading states and error display
    - _Requirements: 44.1, 44.2, 45.1, 45.2_
  
  - [ ] 4.2 Implement authentication service and Redux slice
    - Create authSlice with login, logout, refreshToken actions
    - Implement JWT token storage in HTTP-only cookies
    - Add session expiration handling (8 hours)
    - Implement rate limiting check (5 attempts per minute)
    - _Requirements: 44.1, 44.3, 44.4, 44.6_
  
  - [ ]* 4.3 Write property tests for authentication
    - **Property 17: Authentication Success**
    - **Property 18: Authentication Failure**
    - **Validates: Requirements 44.1, 44.2**

- [ ] 5. Build dashboard layout components
  - [ ] 5.1 Create DashboardLayout with routing
    - Implement layout wrapper with TopNavigation, Sidebar, and page content area
    - Set up React Router v6 with protected routes
    - Add AuthGuard for route protection
    - _Requirements: Foundation for navigation_
  
  - [ ] 5.2 Implement TopNavigation component
    - Build top navigation bar with logo, search, notification icon, settings icon, profile dropdown
    - Create notification dropdown with unread count badge
    - Create profile dropdown with profile, settings, logout options
    - Implement logout action that clears session and redirects to login
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 5.3 Write property tests for navigation
    - **Property 1: Notification UI Consistency**
    - **Property 2: Notification Read and Navigation**
    - **Property 3: Session Termination**
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.6**
  
  - [ ] 5.4 Implement Sidebar component
    - Build collapsible sidebar with navigation menu items
    - Add icons for Dashboard, FIR Management, Case Management, Analytics, Predictions, Heatmap, Crime Reports, SOS Alerts, User Management, Officer Management, Audit Logs, Settings
    - Implement active route highlighting
    - Add collapse/expand toggle
    - Display live update badges on SOS Alerts and Crime Reports
    - _Requirements: Navigation foundation_

### Phase 3: Shared UI Components (P2)

- [ ] 6. Create reusable DataTable component
  - Implement table with columns configuration
  - Add checkbox selection (single and multi-select)
  - Implement column sorting with visual indicators (ascending/descending arrows)
  - Add search input with 300ms debounce
  - Implement multi-criteria filtering with FilterBar integration
  - Add pagination controls (10/25/50/100 per page, page navigation)
  - Implement bulk action toolbar that appears when rows are selected
  - Add loading skeleton state and empty state
  - Add responsive card layout for mobile
  - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 12.1, 12.2, 12.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.1, 14.2, 51.1, 51.2_

- [ ]* 6.1 Write property tests for DataTable
  - **Property 5: Search Filtering**
  - **Property 6: Column Sorting Ascending**
  - **Property 7: Sort Toggle**
  - **Validates: Requirements 5.1, 6.1, 6.2, 12.1, 51.1**

- [ ] 7. Create additional shared components
  - Build InsightCard component with icon, label, value, trend, action button, loading state
  - Build FilterBar component with date pickers, dropdowns, clear all, apply buttons
  - Build FormModal component with validation, loading, error handling
  - Build LoadingSkeleton variants (card, table, chart, map)
  - Build EmptyState component with icon, title, message, optional action
  - Build ErrorBoundary with fallback UI and error logging
  - Build ConfirmDialog for destructive actions
  - _Requirements: 31.1, 31.2, 31.4, 31.5_

- [ ]* 7.1 Write property test for clickable elements
  - **Property 4: Clickable Navigation Consistency**
  - **Validates: Requirements 2.1, 7.1, 28.1, 28.2, 28.3, 28.4**

### Phase 4: Dashboard Page (P1)

- [ ] 8. Implement Dashboard statistics and insights
  - [ ] 8.1 Create DashboardPage layout with grid
    - Build page with 6 InsightCard components
    - Add sections for charts (crime type breakdown, district analysis, trends)
    - Add mini heatmap preview
    - Add recent crimes table
    - _Requirements: 20.1, 28.1_
  
  - [ ] 8.2 Create dashboard Redux slice
    - Define DashboardState with statistics, recentCrimes, districtAnalysis, crimeTypeBreakdown, trends
    - Implement fetchStatistics, fetchRecentCrimes, fetchDistrictAnalysis actions
    - Add auto-refresh logic (every 30 seconds)
    - _Requirements: 20.7, 37.1, 37.2, 37.3_
  
  - [ ] 8.3 Implement clickable InsightCard navigation
    - Make Total FIRs card navigate to FIR management page
    - Make Pending Reports card navigate to crime reports (filtered by pending)
    - Make Active Officers card navigate to officer management
    - Make SOS Alerts card navigate to SOS monitoring page
    - Add hover effects (elevation, border highlight)
    - _Requirements: 2.1, 2.2, 28.1, 28.2, 28.3, 28.4, 28.7_
  
  - [ ]* 8.4 Write property test for dashboard updates
    - **Property 11: Dashboard Statistic Updates**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.5, 20.6**

- [ ] 9. Add dashboard visualizations
  - Create CrimeTypeChart (pie/bar chart with Recharts) showing crime distribution
  - Create DistrictAnalysisChart (bar chart) showing crimes by district
  - Create TrendLineChart showing temporal trends
  - Create MiniHeatmap preview using Leaflet
  - Make chart segments clickable to navigate to filtered analytics
  - _Requirements: 28.5, 37.4, 37.5, 37.6, 37.7_

- [ ] 10. Checkpoint - Dashboard complete
  - Ensure all tests pass, verify navigation works, ask user if questions arise

### Phase 5: FIR Management (P2 & P3)

- [ ] 11. Implement FIR management page
  - [ ] 11.1 Create FIRManagementPage with DataTable
    - Set up page layout with search, filters, table, and action buttons
    - Configure DataTable columns (FIR number, crime type, incident date, location, district, status, assigned officer)
    - Add "Create FIR" button in page header
    - _Requirements: 5.1, 7.1_
  
  - [ ] 11.2 Create FIR Redux slice
    - Define FIRsState with entities, filters, sorting, pagination, selectedIds
    - Implement fetchFIRs, fetchFIRById, createFIR, updateFIR, deleteFIR actions
    - Implement filter and sort logic
    - _Requirements: 5.1, 6.1, 6.2, 7.2_
  
  - [ ] 11.3 Implement FIR search and filtering
    - Add search that filters by FIR ID, crime type, district
    - Add filter dropdowns for status (Pending, Investigation, Solved, Closed)
    - Add filter dropdowns for district, crime type, date range, assigned officer
    - Add "Clear Filters" button
    - Display filtered results count
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [ ] 11.4 Implement FIR row actions
    - Add "Open" button to navigate to FIR detail page
    - Add "Edit" button to open editable form modal
    - Add "Assign" button to show officer selection dialog
    - Add "Close" button with closure reason prompt
    - Add "Delete" button with confirmation dialog
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 12. Create FIR forms and modals
  - [ ] 12.1 Build FIRForm component
    - Create form with fields: crime type, incident date, location, latitude, longitude, district, complainant name, phone, email, description
    - Implement field validation (required fields, email format, phone format, date validation)
    - Show validation errors inline below fields
    - Disable submit until all required fields valid
    - _Requirements: 19.1, 19.2, 45.1, 45.2, 45.3, 45.4, 45.5_
  
  - [ ]* 12.2 Write property tests for FIR validation
    - **Property 13: Input Validation - Required Fields**
    - **Property 14: Input Validation - Email Format**
    - **Validates: Requirements 45.1, 45.2, 15.7**
  
  - [ ] 12.3 Build FIRDetailDrawer component
    - Create drawer/modal showing full FIR details
    - Display all FIR fields in read-only format
    - Add action buttons: Edit, Assign Officer, Update Status, Close, Delete
    - Show assigned officer information if assigned
    - Show audit trail of status changes
    - _Requirements: 7.1, 19.3, 19.4_
  
  - [ ]* 12.4 Write property test for FIR creation
    - **Property 9: Entity Creation Success**
    - **Property 10: Unique Identifier Generation**
    - **Validates: Requirements 19.2**

- [ ] 13. Implement FIR bulk operations
  - Add bulk selection with checkboxes
  - Create bulk action toolbar showing selected count
  - Implement bulk delete with confirmation
  - Implement bulk assign officer
  - Implement bulk status change
  - Handle partial failures with error summary
  - _Requirements: 7.6, 7.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 56.1, 56.2, 56.3, 56.4, 56.5, 56.6_

- [ ]* 13.1 Write property test for bulk operations
  - **Property 20: Bulk Delete Operation**
  - **Validates: Requirements 56.5**

- [ ] 14. Checkpoint - FIR management complete
  - Ensure all tests pass, verify CRUD operations, ask user if questions arise

### Phase 6: Additional CRUD Pages (P3)

- [ ] 15. Implement User Management
  - [ ] 15.1 Create UserManagementPage with DataTable
    - Configure columns: name, email, phone, role, status, registration date
    - Add search and filters (role, status, registration date)
    - _Requirements: 15.1, 15.2_
  
  - [ ] 15.2 Build UserForm component
    - Create form with fields: name, email, phone, address, role
    - Validate email uniqueness and format
    - Implement role dropdown (citizen, admin, officer, viewer)
    - _Requirements: 15.1, 15.7_
  
  - [ ]* 15.3 Write property test for unique validation
    - **Property 15: Input Validation - Unique Constraint**
    - **Validates: Requirements 15.7**
  
  - [ ] 15.4 Implement user actions
    - Create user (POST /api/users)
    - Edit user (PUT /api/users/:id)
    - Suspend user (PATCH /api/users/:id/suspend)
    - Delete user (DELETE /api/users/:id) with confirmation
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6_

- [ ] 16. Implement Officer Management
  - [ ] 16.1 Create OfficerManagementPage with DataTable
    - Configure columns: badge number, name, rank, district, phone, specialization, status, assigned FIRs count
    - Add filters (district, rank, status, specialization)
    - _Requirements: 16.1_
  
  - [ ] 16.2 Build OfficerForm component
    - Create form with fields: name, badge number, rank, district, phone, specialization (multi-select)
    - Validate badge number uniqueness
    - _Requirements: 16.1, 16.2, 16.7_
  
  - [ ] 16.3 Implement officer actions
    - Add officer (POST /api/officers)
    - Assign cases dialog (multi-select FIRs and cases)
    - Transfer officer (change district with confirmation)
    - Deactivate officer (change status, unassign active cases)
    - Prevent deletion if officer has active assignments
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6_

- [ ] 17. Implement Case Management
  - [ ] 17.1 Create CaseManagementPage with DataTable
    - Configure columns: case number, name, priority, status, linked FIRs count, assigned officers, created date
    - Add filters (status, priority, date range)
    - _Requirements: 18.1_
  
  - [ ] 17.2 Build CaseForm component
    - Create form with fields: name, description, priority (dropdown), category, linked FIRs (multi-select), assigned officers (multi-select)
    - _Requirements: 18.1, 18.2_
  
  - [ ] 17.3 Implement case actions
    - Create case (POST /api/cases)
    - Edit case (PUT /api/cases/:id)
    - Add evidence (file upload interface)
    - Archive case (PATCH /api/cases/:id/archive)
    - Delete case (with warning about linked FIRs)
    - Implement relationship graph showing linked FIRs
    - _Requirements: 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 55.1, 55.2, 55.3, 55.4, 55.5_

- [ ] 18. Implement Crime Reports Management
  - [ ] 18.1 Create CrimeReportsPage with DataTable
    - Configure columns: report ID, user name, crime type, location, date, status, submitted date
    - Add filters (status, crime type, date range, district)
    - _Requirements: 17.1_
  
  - [ ] 18.2 Build ReportDetailDrawer component
    - Display full report with crime type, location, date, description, evidence attachments, reporter contact
    - Add action buttons: Approve, Reject, Assign Officer, Delete
    - _Requirements: 3.1, 3.2, 17.1_
  
  - [ ] 18.3 Implement crime report actions
    - Approve report (creates FIR, updates dashboard statistics)
    - Reject report (requires reason, notifies submitter)
    - Assign officer
    - Delete report with confirmation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [ ] 19. Checkpoint - CRUD operations complete
  - Ensure all tests pass, verify all entity management works, ask user if questions arise

### Phase 7: Analytics and Visualizations (P2)

- [ ] 20. Implement Analytics page
  - [ ] 20.1 Create AnalyticsPage layout
    - Build page with FilterBar at top
    - Add sections for TrendChart, ComparisonChart, SeasonalChart, HeatmapPreview, StatisticsGrid
    - _Requirements: 8.1_
  
  - [ ] 20.2 Implement analytics filters
    - Add date range picker (dateFrom, dateTo)
    - Add district dropdown (multi-select)
    - Add crime type dropdown (multi-select)
    - Implement filter persistence when navigating between tabs
    - _Requirements: 8.1, 8.2, 8.3, 8.7_
  
  - [ ] 20.3 Create analytics charts with Recharts
    - Build TrendChart (line chart) showing temporal crime patterns
    - Build ComparisonChart (bar chart) comparing districts or crime types
    - Build SeasonalChart (line chart) showing monthly patterns averaged across years
    - Add chart interactions (hover tooltips, zoom, click drill-down)
    - _Requirements: 8.1, 8.2, 8.3, 53.1, 53.2, 53.3, 53.4, 53.5, 53.6_
  
  - [ ]* 20.4 Write property test for filter application
    - **Property 8: Filter Application Consistency**
    - **Validates: Requirements 8.1, 8.2, 8.3, 9.1**
  
  - [ ] 20.5 Implement hybrid data source queries
    - Query Historical_Crime_Dataset for historical trends
    - Query Live_Application_Database for current year data
    - Combine both data sources with clear labels ("Historical", "Live", "Combined")
    - Display data source indicators on charts
    - _Requirements: 37.4, 37.5, 37.6, 37.7, 40.1, 40.2, 40.3, 40.4, 40.5_

### Phase 8: Interactive Heatmap (P2)

- [ ] 21. Implement Heatmap page
  - [ ] 21.1 Create HeatmapPage with Leaflet map
    - Set up Leaflet map component with React-Leaflet
    - Add base map tiles (OpenStreetMap or similar)
    - Implement zoom controls and pan functionality
    - Add LocationSearch input
    - _Requirements: 30.1, 30.2, 30.7_
  
  - [ ] 21.2 Implement map layers
    - Create layer control panel with toggles
    - District Boundaries layer (SVG overlays with labels)
    - Crime Heatmap layer (color-coded density gradient)
    - Crime Clusters layer (marker clusters that expand on zoom)
    - Individual Crimes layer (markers with crime type icons)
    - SOS Locations layer (pulsing red markers)
    - Patrol Routes layer (polylines showing officer paths)
    - Prediction Zones layer (shaded polygons for high-risk areas)
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7_
  
  - [ ] 21.3 Create interactive map markers and popups
    - Implement CrimeMarkerPopup with FIR details and action buttons
    - Implement SOSMarkerPopup with alert details and dispatch button
    - Add district hover effects with crime count tooltip
    - Make markers clickable to show detail popups
    - _Requirements: 30.3, 30.4, 30.5, 30.6_
  
  - [ ] 21.4 Add map legend and controls
    - Create MapLegend explaining color codes and marker types
    - Add layer toggle controls
    - Implement progressive marker loading (load as user pans/zooms)
    - _Requirements: 30.5, 32.6_

### Phase 9: State Management and API Integration (P4 & P5)

- [ ] 22. Integrate backend APIs
  - [ ] 22.1 Create API client with Axios
    - Set up Axios instance with base URL and interceptors
    - Add request interceptor for JWT token injection
    - Add response interceptor for error handling and token refresh
    - Implement automatic retry logic for failed requests
    - _Requirements: 22.7, 33.1, 33.2, 33.3_
  
  - [ ] 22.2 Implement dashboard API endpoints
    - GET /api/dashboard/statistics
    - GET /api/dashboard/recent-crimes
    - GET /api/dashboard/district-analysis
    - GET /api/dashboard/crime-type-breakdown
    - GET /api/dashboard/trends
    - _Requirements: 22.1, 22.2, 22.3, 22.4_
  
  - [ ] 22.3 Implement FIR API endpoints
    - GET /api/firs (with query params for filters, sorting, pagination)
    - GET /api/firs/:id
    - POST /api/firs
    - PUT /api/firs/:id
    - PATCH /api/firs/:id/status
    - PATCH /api/firs/:id/assign
    - PATCH /api/firs/:id/close
    - DELETE /api/firs/:id
    - POST /api/firs/bulk-delete
    - POST /api/firs/bulk-assign
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_
  
  - [ ] 22.4 Implement remaining CRUD API endpoints
    - Users: GET, POST, PUT, PATCH, DELETE /api/users
    - Officers: GET, POST, PUT, PATCH, DELETE /api/officers
    - Cases: GET, POST, PUT, PATCH, DELETE /api/cases
    - Crime Reports: GET, POST, DELETE /api/crime-reports
    - SOS Alerts: GET, PATCH /api/sos-alerts
    - _Requirements: API integration for all entities_
  
  - [ ] 22.5 Implement analytics API endpoints
    - GET /api/analytics/crime-trends
    - GET /api/analytics/district-comparison
    - GET /api/analytics/seasonal-patterns
    - GET /api/analytics/hotspots
    - GET /api/analytics/historical
    - GET /api/analytics/combined
    - _Requirements: 24.1, 24.2, 24.7_

- [ ] 23. Implement comprehensive error handling
  - Create centralized error handler utility
  - Handle 401 (redirect to login), 403 (permission denied), 404 (not found), 409 (conflict), 429 (rate limit), 5xx (server errors)
  - Display appropriate error messages with retry buttons
  - Implement network error detection with automatic retry
  - Add ErrorBoundary at app root
  - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7_

- [ ] 24. Checkpoint - API integration complete
  - Ensure all tests pass, verify API calls work, ask user if questions arise

### Phase 10: AI Predictions (P6)

- [ ] 25. Implement Prediction page
  - [ ] 25.1 Create PredictionPage layout
    - Build page with prediction parameter selectors
    - Add sections for forecast results, charts, recommendations, risk score map
    - _Requirements: 9.1, 25.1_
  
  - [ ] 25.2 Build prediction parameter form
    - Add district dropdown
    - Add crime type dropdown
    - Add month selector
    - Add "Generate Forecast" button
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ] 25.3 Display prediction results

    - Create ForecastResultCard showing predicted count, confidence percentage, trend direction
    - Display percentage change from previous period
    - Show peak days prediction
    - List contributing factors
    - _Requirements: 9.4, 25.4, 25.5_
  
  - [ ] 25.4 Create forecast visualization chart
    - Build line chart showing historical data points
    - Add projected future values with confidence bands (upper/lower bounds)
    - Make chart interactive with hover tooltips
    - Add chart export functionality
    - _Requirements: 9.5, 25.6, 53.7_
  
  - [ ] 25.5 Build recommendations panel
    - Display suggested officer count
    - Show recommended patrol shift times
    - List priority patrol areas with coordinates
    - Display preventive measures
    - Add "Apply Recommendation" button that pre-fills assignment forms
    - _Requirements: 25.7, 52.1, 52.2, 52.3, 52.4, 52.5_

- [ ] 26. Implement risk score calculation and display
  - [ ] 26.1 Create risk score API integration
    - Call GET /api/prediction/risk-score with district and date parameters
    - Handle response with score (0-100), level (low/medium/high/critical), contributing factors
    - _Requirements: 24.6, 24.7, 39.1, 39.2, 39.3_
  
  - [ ] 26.2 Display risk score visualization
    - Create RiskScore component showing score value and level
    - Display contributing factors list with weights
    - Show comparison with historical average
    - Add neighboring districts comparison
    - Display warning indicator when recent incidents exceed historical by 50%
    - _Requirements: 39.4, 39.5, 39.6, 39.7_
  
  - [ ] 26.3 Integrate risk scores with heatmap
    - Add risk score layer to heatmap
    - Color-code districts by risk level
    - Show risk scores in district hover tooltips
    - _Requirements: 39.1, 39.7_

- [ ] 27. Implement hybrid prediction data integration
  - Query Historical_Crime_Dataset for patterns in selected district (last 5 years)
  - Query Live_Application_Database for recent FIRs (last 90 days)
  - Calculate seasonal patterns from historical data
  - Adjust predictions based on recent trends vs historical averages
  - Flag anomalies when recent data deviates significantly from historical patterns
  - Display both historical average and adjusted forecast
  - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7_

- [ ] 28. Checkpoint - AI predictions complete
  - Ensure all tests pass, verify predictions work, ask user if questions arise

### Phase 11: Real-Time Features (P7)

- [ ] 29. Implement WebSocket connection
  - [ ] 29.1 Create WebSocketManager service
    - Set up WebSocket connection with authentication token
    - Implement connection lifecycle (connect, disconnect, reconnect)
    - Add exponential backoff for reconnection (max 5 attempts)
    - Fallback to HTTP polling if WebSocket unavailable
    - Implement heartbeat/ping mechanism
    - _Requirements: 43.1, 58.3, 58.4_
  
  - [ ] 29.2 Handle WebSocket events
    - Subscribe to channels (sos, firs, officers, notifications, dashboard)
    - Handle incoming events (sos:new, sos:update, fir:created, fir:updated, officer:location, notification:new, dashboard:update, prediction:alert)
    - Dispatch Redux actions on event receipt
    - Update UI in real-time without disrupting user input
    - _Requirements: 20.1, 26.1, 26.2, 43.1, 58.1, 58.2_
  
  - [ ] 29.3 Implement cross-tab synchronization
    - Use BroadcastChannel API for tab synchronization
    - Sync state updates across all open browser tabs
    - Display notification badge on stale tabs when new data available
    - _Requirements: 58.3, 58.4, 58.5, 58.6, 58.7_

- [ ] 30. Implement Notifications system
  - [ ] 30.1 Create notifications Redux slice
    - Define NotificationsState with entities, unreadCount, filters
    - Implement fetchNotifications, markAsRead, markAllAsRead, deleteNotification actions
    - Add addNotification action for WebSocket events
    - _Requirements: 26.1, 26.5, 27.1, 27.2_
  
  - [ ] 30.2 Build notification UI components
    - Create NotificationDropdown with list, badges, filters
    - Add notification type icons (SOS, crime report, prediction, system, assignment)
    - Implement priority styling (critical = red, high = orange, normal = blue, low = gray)
    - Add click handler to mark as read and navigate to linked page
    - _Requirements: 26.1, 26.3, 26.4, 26.5, 26.6, 26.7_
  
  - [ ] 30.3 Implement notification management actions
    - Mark as read (single notification)
    - Mark all as read
    - Delete notification
    - Filter by type (All, Unread, SOS, Crime Reports, System)
    - Load older notifications on scroll
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_
  
  - [ ]* 30.4 Write property test for notifications
    - **Property 1: Notification UI Consistency** (already defined)
    - **Property 2: Notification Read and Navigation** (already defined)
    - **Validates: Requirements 26.1, 26.5, 26.6, 27.1**

- [ ] 31. Implement SOS Alerts monitoring
  - [ ] 31.1 Create SOSAlertsPage
    - Build page with real-time alerts table
    - Add auto-refresh every 5 seconds
    - Display alert cards with user info, location, timestamp, status
    - Add filters (status, time range)
    - _Requirements: 43.1, 43.2_
  
  - [ ] 31.2 Build SOSAlertDetailPanel
    - Display full alert information (user name, phone, coordinates, timestamp)
    - Show alert location on map with pulsing red marker
    - Display response time (seconds from creation to assignment)
    - Add status update controls (Assigned, In Progress, Resolved, Cancelled)
    - _Requirements: 43.2, 43.3, 43.6, 43.7_
  
  - [ ] 31.3 Implement dispatch functionality
    - Build DispatchDialog showing nearby officers
    - Query GET /api/sos-alerts/nearby-officers with lat/lng/radius
    - Display officers with distance and estimated arrival time
    - Implement officer assignment (PATCH /api/sos-alerts/:id/assign)
    - Send real-time notification to assigned officer
    - Calculate and display response time
    - _Requirements: 43.4, 43.5, 43.7_
  
  - [ ] 31.4 Add audio/visual alerts for critical SOS
    - Play audio notification sound for new SOS alerts
    - Show browser notification if permission granted
    - Display prominent banner for critical priority alerts
    - _Requirements: 26.1_

- [ ] 32. Implement live officer tracking
  - [ ] 32.1 Create LiveTrackingPage
    - Build page with live map showing officer locations
    - Add officer list sidebar with last update time and connection status
    - Display movement history trails (last 4 hours)
    - _Requirements: 11.1, 11.4, 11.6, 11.7_
  
  - [ ] 32.2 Implement officer marker updates
    - Display live markers for all active officers
    - Update marker positions within 5 seconds of location change
    - Add marker click popups with officer name, badge, speed, timestamp
    - Show coordinates in lat/lng format with 6 decimal precision
    - _Requirements: 11.1, 11.2, 11.3, 11.5_
  
  - [ ] 32.3 Add officer selection and centering
    - Clicking officer in sidebar centers map on their location
    - Highlight selected officer marker
    - Show detailed officer information panel
    - _Requirements: 11.6_

- [ ] 33. Checkpoint - Real-time features complete
  - Ensure all tests pass, verify WebSocket works, ask user if questions arise

### Phase 12: Historical Data Import (P5)

- [ ] 34. Implement CSV parser
  - [ ] 34.1 Create CSV parser utility
    - Build parser that reads dstrIPC_1.csv file
    - Validate CSV structure (required columns: STATE/UT, DISTRICT, YEAR, crime type columns)
    - Parse and validate YEAR column (numeric, 1990-current year)
    - Normalize district names (title case, trim whitespace)
    - Convert numeric strings to integers for crime count columns
    - _Requirements: 35.2, 35.3, 41.1, 41.2, 41.3, 41.4_
  
  - [ ]* 34.2 Write property test for CSV import
    - **Property 16: Input Validation - Year Range**
    - **Property 22: Import-Export Round Trip**
    - **Validates: Requirements 35.3, 42.7**
  
  - [ ] 34.3 Handle parsing errors
    - Skip rows with missing required fields
    - Log skipped rows to error file with row number and reason
    - Continue processing remaining valid rows
    - _Requirements: 41.5_

- [ ] 35. Implement database import utility
  - [ ] 35.1 Create import service
    - Build API endpoint POST /api/import/historical-csv
    - Accept CSV file upload with validation options
    - Create background job for processing large files
    - Insert parsed records into historical_crimes table
    - _Requirements: 35.1, 35.4, 41.6_
  
  - [ ] 35.2 Add import status tracking
    - Return jobId for status checking
    - Implement GET /api/import/status/:jobId
    - Track progress (rows processed, imported, skipped, errors)
    - Display import summary on completion
    - _Requirements: 41.7_
  
  - [ ] 35.3 Create import UI
    - Build import page with file upload interface
    - Add validation options (skip duplicates, validate only mode)
    - Show progress bar during import
    - Display summary table (total rows, processed, imported, skipped, errors)
    - Show error list with row numbers
    - _Requirements: 35.1, 41.7_

- [ ] 36. Implement CSV export utility
  - [ ] 36.1 Create export service
    - Build API endpoint POST /api/export/data
    - Query database records based on filters
    - Format records into CSV structure
    - Generate column headers matching original format
    - Sort records (state, district, year ascending)
    - _Requirements: 42.1, 42.2, 42.4_
  
  - [ ] 36.2 Add export functionality
    - Format numeric values without decimals
    - Encode special characters for CSV validity
    - Save file with timestamp in filename
    - Implement GET /api/export/download/:fileId for download
    - _Requirements: 42.3, 42.5, 42.6_
  
  - [ ] 36.3 Test round-trip integrity
    - Verify export then import produces equivalent data
    - Ensure all field values preserved (excluding auto-generated IDs)
    - _Requirements: 42.7_

- [ ] 37. Make Historical_Crime_Dataset read-only
  - Set PostgreSQL table permissions (GRANT SELECT only)
  - Ensure no API endpoints for modification or deletion
  - Display read-only indicator in UI
  - _Requirements: 35.6_

- [ ] 38. Checkpoint - Data import complete
  - Ensure all tests pass, verify CSV import works, ask user if questions arise

### Phase 13: Settings and Configuration (P8)

- [ ] 39. Implement Settings page
  - [ ] 39.1 Create SettingsPage layout
    - Build page with tabbed interface or sections
    - Add sections: Notification Preferences, Display Settings, Data Management, Security Settings, System Information
    - _Requirements: 4.1, 4.2, 49.1_
  
  - [ ] 39.2 Build notification preferences section
    - Add toggles for each notification type (SOS, crime reports, predictions, system alerts, assignments)
    - Implement save functionality (PUT /api/settings)
    - Load current preferences from user_settings table
    - _Requirements: 49.1_
  
  - [ ] 39.3 Build display settings section
    - Add theme dropdown (light/dark mode)
    - Add refresh interval dropdown (30s, 1min, 5min, disabled)
    - Add default page size dropdown (10, 25, 50, 100 rows)
    - Apply settings immediately without requiring reload
    - _Requirements: 49.2, 49.3, 49.4, 49.7_
  
  - [ ] 39.4 Build data management section
    - Add CSV import button linking to import page
    - Add export current data button
    - Show database statistics (total records, last import date)
    - _Requirements: Data management_
  
  - [ ] 39.5 Build security settings section
    - Add change password form
    - Add two-factor authentication toggle (if implemented)
    - Show active sessions list
    - _Requirements: Security management_
  
  - [ ] 39.6 Build system information section
    - Display app version
    - Show database connection status
    - Display performance metrics (if Super Admin)
    - Add reset to defaults button
    - _Requirements: 49.6, 59.7_

- [ ] 40. Implement settings persistence
  - Create user_settings table (if not exists)
  - Implement GET /api/settings and PUT /api/settings endpoints
  - Store settings per user
  - Load settings on app initialization
  - _Requirements: 49.5_

- [ ] 41. Checkpoint - Settings complete
  - Ensure all tests pass, verify settings save/load works, ask user if questions arise

### Phase 14: Audit Logging (P8)

- [ ] 42. Implement Audit Logs page
  - [ ] 42.1 Create AuditLogsPage with DataTable
    - Configure columns: timestamp, user, action, entity type, entity ID
    - Add filters (user, action type, entity type, date range)
    - Display logs in reverse chronological order (newest first)
    - _Requirements: 48.3, 48.4_
  
  - [ ] 42.2 Build AuditLogDetailDrawer
    - Display full log entry details
    - Show old values and new values (diff view)
    - Display IP address and user agent
    - _Requirements: 48.2_
  
  - [ ] 42.3 Add export functionality
    - Implement CSV export with current filters applied
    - Include all audit log fields in export
    - _Requirements: 48.5_

- [ ] 43. Implement audit log creation
  - [ ] 43.1 Create audit logging middleware
    - Hook into all create, update, delete operations
    - Capture user ID, action type, entity type, entity ID
    - Record old values and new values as JSONB
    - Store IP address and user agent from request
    - _Requirements: 48.1, 48.2_
  
  - [ ]* 43.2 Write property test for audit logging
    - **Property 19: Audit Log Creation**
    - **Validates: Requirements 48.1**
  
  - [ ] 43.3 Make audit logs immutable
    - Remove API endpoints for modification or deletion
    - Set database permissions to prevent updates/deletes
    - Add database trigger to prevent modifications
    - _Requirements: 48.6_
  
  - [ ] 43.4 Implement log retention
    - Set up automatic archival after 1 year
    - Create archived_audit_logs table
    - Implement background job for archival
    - _Requirements: 48.7_

- [ ] 44. Log security events
  - Log all permission-restricted access attempts
  - Log authentication failures and successes
  - Log session expirations
  - Log bulk operations
  - _Requirements: 34.7_

- [ ] 45. Checkpoint - Audit logging complete
  - Ensure all tests pass, verify logs are created, ask user if questions arise

### Phase 15: Performance, Accessibility, Security (P8)

- [ ] 46. Implement performance optimizations
  - [ ] 46.1 Add code splitting and lazy loading
    - Implement React.lazy() for page components
    - Split vendor bundles (React, Redux, Recharts, Leaflet)
    - Load page JavaScript bundles on demand
    - Target <1 second load time on broadband
    - _Requirements: 32.1, 32.2_
  
  - [ ] 46.2 Implement virtual scrolling for large tables
    - Add react-window or react-virtualized to DataTable
    - Render only visible rows (for lists >100 rows)
    - Render additional rows on scroll
    - _Requirements: 32.3, 32.4_
  
  - [ ] 46.3 Add lazy loading for images and charts
    - Defer loading non-critical images until near viewport
    - Lazy load charts as user scrolls
    - _Requirements: 32.5_
  
  - [ ] 46.4 Implement progressive map marker loading
    - Load markers as user pans/zooms
    - Use clustering for large marker counts (>1000)
    - Target <3 seconds for rendering 1000+ markers
    - _Requirements: 32.6_
  
  - [ ] 46.5 Add response caching
    - Cache API responses for 5 minutes
    - Implement cache invalidation on mutations
    - _Requirements: 21.4, 31.7_
  
  - [ ] 46.6 Optimize initial page load
    - Target <2 seconds initial load time
    - Target <3 seconds time to interactive
    - Implement loading skeletons to improve perceived performance
    - _Requirements: 31.1, 31.2, 31.3_

- [ ] 47. Implement accessibility features
  - [ ] 47.1 Add keyboard navigation
    - Ensure all interactive elements are tab-reachable
    - Implement visible focus indicators (high contrast borders)
    - Add keyboard shortcuts for common actions
    - Test complete keyboard navigation flow
    - _Requirements: 47.1, 47.2_
  
  - [ ]* 47.2 Write property test for keyboard navigation
    - **Property 21: Keyboard Navigation Completeness**
    - **Validates: Requirements 47.1**
  
  - [ ] 47.3 Add screen reader support
    - Add ARIA labels to all interactive elements
    - Add alt text to all images and icons
    - Ensure proper heading hierarchy
    - Associate form labels with inputs using for/id
    - Test with NVDA and VoiceOver
    - _Requirements: 47.3, 47.4, 47.7_
  
  - [ ] 47.4 Ensure color contrast compliance
    - Verify 4.5:1 contrast ratio for normal text
    - Verify 3:1 contrast ratio for large text
    - Test with color blindness simulators
    - _Requirements: 47.5_
  
  - [ ] 47.5 Add font size adjustment support
    - Ensure layout doesn't break up to 200% zoom
    - Test responsive behavior at different zoom levels
    - _Requirements: 47.6_
  
  - [ ] 47.6 Run automated accessibility tests
    - Use axe-core for automated testing
    - Run tests on all pages
    - Fix reported violations
    - Target WCAG 2.1 Level AA compliance
    - _Requirements: Accessibility compliance_

- [ ] 48. Implement security features
  - [ ] 48.1 Add role-based access control (RBAC)
    - Define roles: Super Admin, Admin, Officer, Viewer
    - Assign permissions to roles
    - Hide navigation items user cannot access
    - Prevent client-side route access
    - _Requirements: 34.1, 34.2, 34.3, 34.4_
  
  - [ ] 48.2 Implement backend permission checks
    - Validate user roles on every API request
    - Return 403 for unauthorized attempts
    - Require Super Admin for deleting admin users
    - _Requirements: 34.5, 34.6_
  
  - [ ] 48.3 Add input sanitization
    - Sanitize all user inputs on client and server
    - Prevent XSS attacks (escape HTML)
    - Prevent SQL injection (use parameterized queries)
    - Validate file uploads (type, size, content)
    - _Requirements: Security hardening_
  
  - [ ] 48.4 Implement CSRF protection
    - Add CSRF tokens to forms
    - Validate tokens on backend
    - Use SameSite cookies
    - _Requirements: Security hardening_
  
  - [ ] 48.5 Add rate limiting
    - Implement rate limits on authentication (5 attempts/minute)
    - Add rate limits on API endpoints
    - Return 429 with retry-after header
    - _Requirements: 44.6_
  
  - [ ] 48.6 Secure session management
    - Store JWT in HTTP-only cookies with secure flag
    - Implement 8-hour session expiration
    - Add session refresh mechanism
    - Clear all cookies on logout
    - _Requirements: 44.3, 44.4, 44.7_

- [ ] 49. Add responsive design and mobile support
  - [ ] 49.1 Implement responsive layouts
    - Collapse sidebar to hamburger menu on mobile (<768px)
    - Convert tables to card layout on mobile
    - Resize charts to fit viewport width
    - Ensure touch targets are 44x44 pixels minimum
    - _Requirements: 46.1, 46.2, 46.4, 46.5_
  
  - [ ] 49.2 Add mobile map interactions
    - Support pinch-to-zoom gestures
    - Support two-finger pan gestures
    - _Requirements: 46.6_
  
  - [ ] 49.3 Optimize for mobile data usage
    - Load smaller image sizes on mobile
    - Reduce API payload sizes
    - _Requirements: 46.7_
  
  - [ ] 49.4 Ensure touch device functionality
    - Remove hover-only interactions
    - Add tap handlers for all interactions
    - Test on touch devices
    - _Requirements: 46.3_

- [ ] 50. Add browser compatibility features
  - [ ] 50.1 Test cross-browser compatibility
    - Test on Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
    - Fix browser-specific issues
    - _Requirements: 60.1_
  
  - [ ] 50.2 Add graceful degradation
    - Display upgrade banner for unsupported browsers
    - Implement feature detection with fallbacks
    - Fallback to HTTP polling if WebSocket unavailable
    - Fallback to sessionStorage if localStorage unavailable
    - _Requirements: 60.2, 60.3, 60.4, 60.5_
  
  - [ ] 50.3 Ensure no plugin dependencies
    - Verify app works without browser plugins
    - _Requirements: 60.6_
  
  - [ ] 50.4 Add browser compatibility logging
    - Log unsupported feature usage
    - Help identify compatibility issues
    - _Requirements: 60.7_

- [ ] 51. Implement performance monitoring
  - [ ] 51.1 Add performance metrics tracking
    - Track page load times
    - Track API response times per endpoint
    - Count error rates (4xx and 5xx)
    - Display on settings page (Super Admin only)
    - _Requirements: 59.1, 59.2, 59.3, 59.7_
  
  - [ ] 51.2 Create performance metrics page
    - Display charts showing load time trends (24 hours)
    - Show average response times per endpoint
    - Display error rate percentage
    - _Requirements: 59.4_
  
  - [ ] 51.3 Add performance alerts
    - Alert when API response time >2 seconds
    - Alert when error rate >5% over 15 minutes
    - Display warning/critical notifications
    - _Requirements: 59.5, 59.6_

- [ ] 52. Final QA and testing
  - [ ] 52.1 Run complete test suite
    - Run all unit tests (target 80% coverage)
    - Run all property-based tests (22 properties, 100+ iterations each)
    - Run integration tests
    - Run E2E tests on all critical flows
    - Run accessibility tests
    - _Requirements: All testing requirements_
  
  - [ ] 52.2 Perform manual testing
    - Test all user flows end-to-end
    - Test on different browsers
    - Test on different screen sizes
    - Test with screen reader
    - Test keyboard navigation
    - _Requirements: Manual QA_
  
  - [ ] 52.3 Fix all identified issues
    - Address failing tests
    - Fix bugs found in manual testing
    - Resolve accessibility violations
    - _Requirements: Bug fixes_
  
  - [ ] 52.4 Load testing
    - Test with 100 concurrent users
    - Monitor server CPU, memory, database connections
    - Verify API response times remain <2 seconds under load
    - _Requirements: Performance under load_
  
  - [ ] 52.5 Security audit
    - Review all authentication and authorization flows
    - Test for common vulnerabilities (XSS, CSRF, SQL injection)
    - Verify role-based access control works correctly
    - Test rate limiting
    - _Requirements: Security audit_

- [ ] 53. Documentation and deployment
  - [ ] 53.1 Write technical documentation
    - Document API endpoints
    - Document database schema
    - Document state management architecture
    - Create developer setup guide
    - _Requirements: Documentation_
  
  - [ ] 53.2 Write user documentation
    - Create user guide for admin features
    - Document common workflows
    - Create troubleshooting guide
    - _Requirements: User documentation_
  
  - [ ] 53.3 Prepare for deployment
    - Set up CI/CD pipeline
    - Configure production environment variables
    - Set up database migrations
    - Configure monitoring and logging
    - _Requirements: Deployment preparation_

- [ ] 54. Final checkpoint - Project complete!
  - All 60 requirements implemented
  - All 22 correctness properties validated
  - All tests passing
  - Production ready

---

## Summary

**Total Phases**: 15  
**Total Tasks**: 150+ (with sub-tasks)  
**Total Property Tests**: 22 correctness properties  
**Priority Distribution**:
- 🔴 P1 (Critical): Phases 1-2, 4 (authentication, navigation, dashboard)
- 🔴 P2 (High): Phases 3, 5, 7-8 (components, FIR, analytics, maps)
- 🔴 P3 (High): Phase 6 (CRUD operations)
- 🟠 P4 (Medium): Phase 9 (state management)
- 🟠 P5 (Medium): Phase 9, 12 (API integration, data import)
- 🟡 P6 (Lower): Phase 10 (AI predictions)
- 🟡 P7 (Lower): Phase 11 (real-time features)
- 🟢 P8 (Lowest): Phases 13-15 (settings, audit, optimization)

**Checkpoints**: 12 checkpoints throughout to verify progress and address issues

**Testing Approach**: Test-driven with property-based tests integrated throughout

**Estimated Timeline**: 12-16 weeks for full implementation with a dedicated team

---

## Next Steps

1. **Review this implementation plan** and confirm approach
2. **Set up development environment** (Node.js, PostgreSQL, Python for AI service)
3. **Start with Phase 1** (Project Setup and Foundation)
4. **Follow phases sequentially** with checkpoints
5. **Deploy to staging** after Phase 9 for early feedback
6. **Complete remaining phases** and deploy to production

---

**The specification is now complete!** You can begin implementing tasks by following the phases in order. Each task includes specific requirements it addresses, making it easy to track progress and ensure complete coverage.
