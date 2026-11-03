# Redux Slices

This directory contains Redux Toolkit slices for managing application state.

## What is a Slice?

A slice is a collection of Redux reducer logic and actions for a single feature. Redux Toolkit's `createSlice` simplifies the process of writing Redux logic.

## Example Slice Structure

```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { FIR, PaginatedResponse, FilterParams } from '@/src/types';
import { firService } from '@/src/services/fir.service';

interface FIRState {
  firs: FIR[];
  currentFIR: FIR | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  filters: FilterParams;
}

const initialState: FIRState = {
  firs: [],
  currentFIR: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 25,
    total: 0,
  },
  filters: {},
};

// Async thunks for API calls
export const fetchFIRs = createAsyncThunk(
  'firs/fetchFIRs',
  async (params: { page: number; pageSize: number; filters?: FilterParams }) => {
    const response = await firService.getFIRs(params);
    return response;
  }
);

export const fetchFIRById = createAsyncThunk(
  'firs/fetchFIRById',
  async (id: string) => {
    const response = await firService.getFIRById(id);
    return response;
  }
);

export const createFIR = createAsyncThunk(
  'firs/createFIR',
  async (data: Partial<FIR>) => {
    const response = await firService.createFIR(data);
    return response;
  }
);

export const updateFIR = createAsyncThunk(
  'firs/updateFIR',
  async ({ id, data }: { id: string; data: Partial<FIR> }) => {
    const response = await firService.updateFIR(id, data);
    return response;
  }
);

export const deleteFIR = createAsyncThunk(
  'firs/deleteFIR',
  async (id: string) => {
    await firService.deleteFIR(id);
    return id;
  }
);

// Create the slice
const firSlice = createSlice({
  name: 'firs',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<FilterParams>) => {
      state.filters = action.payload;
    },
    clearFilters: state => {
      state.filters = {};
    },
    setCurrentFIR: (state, action: PayloadAction<FIR | null>) => {
      state.currentFIR = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      // Fetch FIRs
      .addCase(fetchFIRs.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFIRs.fulfilled, (state, action) => {
        state.loading = false;
        state.firs = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          pageSize: action.payload.pageSize,
          total: action.payload.total,
        };
      })
      .addCase(fetchFIRs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch FIRs';
      })
      
      // Fetch single FIR
      .addCase(fetchFIRById.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFIRById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentFIR = action.payload;
      })
      .addCase(fetchFIRById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch FIR';
      })
      
      // Create FIR
      .addCase(createFIR.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createFIR.fulfilled, (state, action) => {
        state.loading = false;
        state.firs.unshift(action.payload);
        state.pagination.total += 1;
      })
      .addCase(createFIR.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to create FIR';
      })
      
      // Update FIR
      .addCase(updateFIR.fulfilled, (state, action) => {
        const index = state.firs.findIndex(fir => fir.id === action.payload.id);
        if (index !== -1) {
          state.firs[index] = action.payload;
        }
        if (state.currentFIR?.id === action.payload.id) {
          state.currentFIR = action.payload;
        }
      })
      
      // Delete FIR
      .addCase(deleteFIR.fulfilled, (state, action) => {
        state.firs = state.firs.filter(fir => fir.id !== action.payload);
        state.pagination.total -= 1;
        if (state.currentFIR?.id === action.payload) {
          state.currentFIR = null;
        }
      });
  },
});

// Export actions
export const { setFilters, clearFilters, setCurrentFIR } = firSlice.actions;

// Export selectors
export const selectFIRs = (state: { firs: FIRState }) => state.firs.firs;
export const selectCurrentFIR = (state: { firs: FIRState }) => state.firs.currentFIR;
export const selectFIRLoading = (state: { firs: FIRState }) => state.firs.loading;
export const selectFIRError = (state: { firs: FIRState }) => state.firs.error;
export const selectFIRPagination = (state: { firs: FIRState }) => state.firs.pagination;
export const selectFIRFilters = (state: { firs: FIRState }) => state.firs.filters;

// Export reducer
export default firSlice.reducer;
```

## Usage in Components

```typescript
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  fetchFIRs,
  selectFIRs,
  selectFIRLoading,
  selectFIRPagination,
  setFilters,
} from '@/src/store/slices/firSlice';

function FIRList() {
  const dispatch = useAppDispatch();
  const firs = useAppSelector(selectFIRs);
  const loading = useAppSelector(selectFIRLoading);
  const pagination = useAppSelector(selectFIRPagination);

  useEffect(() => {
    dispatch(fetchFIRs({ page: 1, pageSize: 25 }));
  }, [dispatch]);

  const handleFilter = (filters: FilterParams) => {
    dispatch(setFilters(filters));
    dispatch(fetchFIRs({ page: 1, pageSize: 25, filters }));
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {firs.map(fir => (
        <div key={fir.id}>{fir.firNumber}</div>
      ))}
    </div>
  );
}
```

## Registering Slices

After creating a slice, register it in `src/store/index.ts`:

```typescript
import firReducer from './slices/firSlice';

export const store = configureStore({
  reducer: {
    firs: firReducer,
    // Add other slices here
  },
});
```

## Slices to Create

Based on the requirements, these slices should be created:

1. **firSlice.ts** - Manage FIR state
2. **caseSlice.ts** - Manage investigation cases
3. **userSlice.ts** - Manage users
4. **officerSlice.ts** - Manage officers
5. **crimeReportSlice.ts** - Manage crime reports
6. **sosAlertSlice.ts** - Manage SOS alerts
7. **notificationSlice.ts** - Manage notifications
8. **dashboardSlice.ts** - Manage dashboard statistics
9. **authSlice.ts** - Manage authentication state
10. **settingsSlice.ts** - Manage user settings

Each slice should follow the pattern above with async thunks for API operations and reducers for local state updates.
