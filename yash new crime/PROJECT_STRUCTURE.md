# Project Structure

This document describes the directory structure and organization of the Crime Prediction & Analysis System Admin Dashboard.

## Directory Structure

```
src/
├── components/          # Reusable React components
│   ├── dashboard/      # Dashboard-specific components
│   ├── layout/         # Layout components (Sidebar, Topbar, etc.)
│   └── shared/         # Shared/common components (to be created)
├── constants/          # Application constants and configuration
├── hooks/              # Custom React hooks
├── lib/                # Third-party library utilities
├── pages/              # Page components
│   ├── admin/          # Admin pages
│   ├── auth/           # Authentication pages
│   ├── citizen/        # Citizen pages
│   └── public/         # Public pages
├── services/           # API service layer
├── store/              # Redux state management
│   └── slices/         # Redux slices
├── test/               # Test utilities and setup
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## Key Files

### Configuration Files

- **vite.config.ts** - Vite build configuration with Vitest setup
- **tsconfig.json** - TypeScript configuration
- **.eslintrc.cjs** - ESLint configuration for code quality
- **.prettierrc** - Prettier configuration for code formatting
- **package.json** - Dependencies and scripts

### Core Application Files

- **src/main.tsx** - Application entry point
- **src/App.tsx** - Root component with routing
- **src/index.css** - Global styles

### State Management

- **src/store/index.ts** - Redux store configuration
- **src/store/hooks.ts** - Typed Redux hooks
- **src/store/slices/** - Redux slices for different features

### Services

- **src/services/api.ts** - Axios instance with interceptors
- **src/services/dashboard.service.ts** - Dashboard API calls
- Additional service files will be created for FIRs, cases, etc.

### Types

- **src/types/index.ts** - TypeScript interfaces and types

### Constants

- **src/constants/index.ts** - Application-wide constants

### Utilities

- **src/utils/formatters.ts** - Data formatting utilities
- Additional utility files as needed

### Hooks

- **src/hooks/useDebounce.ts** - Debounce hook for search
- Additional custom hooks as needed

## Feature-Based Organization

This project follows a feature-based organization pattern:

1. **Shared components** in `src/components/shared/`
2. **Feature-specific components** in `src/components/[feature]/`
3. **Redux slices** per feature in `src/store/slices/`
4. **Service files** per feature in `src/services/`

## Technology Stack

### Core
- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server

### State Management
- **Redux Toolkit** - State management
- **React Redux** - React bindings for Redux

### Routing
- **React Router v6** - Client-side routing

### Styling
- **Tailwind CSS** - Utility-first CSS framework

### Data Visualization
- **Recharts** - Charts and graphs
- **Leaflet** - Interactive maps

### HTTP Client
- **Axios** - Promise-based HTTP client

### Testing
- **Vitest** - Unit testing framework
- **React Testing Library** - Component testing utilities
- **jsdom** - DOM implementation for testing

### Code Quality
- **ESLint** - Linting
- **Prettier** - Code formatting
- **TypeScript** - Static type checking

## Available Scripts

- `npm run dev` - Start development server on port 3000
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI
- `npm run test:run` - Run tests once

## Development Guidelines

1. **Component Organization**: Keep components small and focused
2. **Type Safety**: Use TypeScript types for all functions and components
3. **State Management**: Use Redux for global state, local state for component-specific data
4. **API Calls**: Use service files in `src/services/` for all API interactions
5. **Code Quality**: Run `npm run lint` and `npm run type-check` before committing
6. **Testing**: Write tests for critical functionality
7. **Formatting**: Code is auto-formatted with Prettier

## Next Steps

1. Create shared UI components (DataTable, FilterBar, etc.)
2. Implement Redux slices for each feature
3. Create service files for all API endpoints
4. Build out page components with actual functionality
5. Write unit tests for components and utilities
6. Set up end-to-end testing if needed
