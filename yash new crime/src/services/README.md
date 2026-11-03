# API Services

This directory contains service files for making API calls to the backend.

## Architecture

Each service file exports an object with methods for interacting with a specific resource or feature.

## Base API Client

The `api.ts` file exports a configured Axios instance with:
- Base URL from environment variables
- Request interceptors for authentication tokens
- Response interceptors for error handling
- Generic methods (get, post, put, patch, delete)

## Service File Pattern

```typescript
import { api } from './api';
import { FIR, PaginatedResponse, FilterParams } from '@/src/types';

export const firService = {
  // Get paginated list of FIRs
  getFIRs: async (params: {
    page: number;
    pageSize: number;
    filters?: FilterParams;
  }): Promise<PaginatedResponse<FIR>> => {
    const response = await api.get<PaginatedResponse<FIR>>('/firs', {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        ...params.filters,
      },
    });
    return response.data;
  },

  // Get single FIR by ID
  getFIRById: async (id: string): Promise<FIR> => {
    const response = await api.get<FIR>(`/firs/${id}`);
    return response.data;
  },

  // Create new FIR
  createFIR: async (data: Partial<FIR>): Promise<FIR> => {
    const response = await api.post<FIR>('/firs', data);
    return response.data;
  },

  // Update existing FIR
  updateFIR: async (id: string, data: Partial<FIR>): Promise<FIR> => {
    const response = await api.put<FIR>(`/firs/${id}`, data);
    return response.data;
  },

  // Update FIR status
  updateFIRStatus: async (
    id: string,
    status: string,
    notes?: string
  ): Promise<FIR> => {
    const response = await api.patch<FIR>(`/firs/${id}/status`, {
      status,
      notes,
    });
    return response.data;
  },

  // Assign officer to FIR
  assignOfficer: async (firId: string, officerId: string): Promise<FIR> => {
    const response = await api.post<FIR>(`/firs/${firId}/assign`, {
      officerId,
    });
    return response.data;
  },

  // Close FIR
  closeFIR: async (
    id: string,
    closureReason: string,
    resolutionNotes?: string
  ): Promise<FIR> => {
    const response = await api.patch<FIR>(`/firs/${id}/close`, {
      closureReason,
      resolutionNotes,
    });
    return response.data;
  },

  // Delete FIR
  deleteFIR: async (id: string): Promise<void> => {
    await api.delete(`/firs/${id}`);
  },

  // Bulk operations
  bulkAssign: async (firIds: string[], officerId: string): Promise<void> => {
    await api.post('/firs/bulk/assign', { firIds, officerId });
  },

  bulkDelete: async (firIds: string[]): Promise<void> => {
    await api.post('/firs/bulk/delete', { firIds });
  },

  // Export FIRs
  exportFIRs: async (
    format: 'csv' | 'excel' | 'pdf',
    filters?: FilterParams
  ): Promise<Blob> => {
    const response = await api.get(`/firs/export/${format}`, {
      params: filters,
      responseType: 'blob',
    });
    return response.data;
  },
};
```

## Error Handling

Services should let errors propagate to the calling code (Redux thunks or components) where they can be handled appropriately. The base API client already handles common errors like 401 (unauthorized) automatically.

```typescript
// In a component or Redux thunk
try {
  const fir = await firService.getFIRById(id);
  // Handle success
} catch (error) {
  const errorMessage = getErrorMessage(error);
  // Handle error (show toast, set error state, etc.)
}
```

## Services to Create

Based on the requirements, these service files should be created:

1. **fir.service.ts** - FIR operations
2. **case.service.ts** - Case operations
3. **user.service.ts** - User management operations
4. **officer.service.ts** - Officer management operations
5. **crimeReport.service.ts** - Crime report operations
6. **sosAlert.service.ts** - SOS alert operations
7. **notification.service.ts** - Notification operations
8. **analytics.service.ts** - Analytics and statistics
9. **prediction.service.ts** - AI prediction operations
10. **auth.service.ts** - Authentication operations
11. **settings.service.ts** - User settings operations
12. **audit.service.ts** - Audit log operations

## API Endpoints Convention

The backend API should follow RESTful conventions:

- `GET /api/resource` - List resources (with pagination/filtering)
- `GET /api/resource/:id` - Get single resource
- `POST /api/resource` - Create new resource
- `PUT /api/resource/:id` - Update entire resource
- `PATCH /api/resource/:id` - Partial update
- `DELETE /api/resource/:id` - Delete resource

### Special Endpoints

- `POST /api/resource/:id/action` - Perform action on resource
- `POST /api/resource/bulk/action` - Bulk operations
- `GET /api/resource/export/:format` - Export data

## TypeScript Benefits

All service methods are fully typed:
- Parameters are validated at compile time
- Return types are known
- IDE autocomplete works perfectly
- Refactoring is safe

## Testing Services

Service methods can be tested by mocking the axios instance:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { firService } from './fir.service';
import * as api from './api';

vi.mock('./api');

describe('firService', () => {
  it('should fetch FIRs', async () => {
    const mockData = { data: [], total: 0, page: 1, pageSize: 25 };
    vi.mocked(api.api.get).mockResolvedValue({ data: mockData });

    const result = await firService.getFIRs({ page: 1, pageSize: 25 });

    expect(result).toEqual(mockData);
    expect(api.api.get).toHaveBeenCalledWith('/firs', {
      params: { page: 1, pageSize: 25 },
    });
  });
});
```
