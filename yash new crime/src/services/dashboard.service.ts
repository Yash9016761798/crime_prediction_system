import { api } from './api';

// Dashboard service for fetching dashboard statistics and data
export interface DashboardStatistics {
  totalFIRs: number;
  activeCases: number;
  pendingReports: number;
  activeOfficers: number;
  sosAlerts: number;
  solvedCases: number;
  historicalCrimes: number;
}

export interface RecentCrime {
  id: string;
  firNumber: string;
  crimeType: string;
  date: string;
  location: string;
  district: string;
  status: string;
}

export interface DistrictAnalysis {
  district: string;
  count: number;
}

export interface CrimeTypeBreakdown {
  type: string;
  count: number;
}

export interface TrendData {
  date: string;
  count: number;
}

export const dashboardService = {
  getStatistics: async () => {
    const response = await api.get<DashboardStatistics>('/dashboard/statistics');
    return response.data;
  },

  getRecentCrimes: async (limit = 10) => {
    const response = await api.get<RecentCrime[]>('/dashboard/recent-crimes', {
      params: { limit },
    });
    return response.data;
  },

  getDistrictAnalysis: async () => {
    const response = await api.get<DistrictAnalysis[]>('/dashboard/district-analysis');
    return response.data;
  },

  getCrimeTypeBreakdown: async () => {
    const response = await api.get<CrimeTypeBreakdown[]>('/dashboard/crime-type-breakdown');
    return response.data;
  },

  getTrends: async (period = '30d') => {
    const response = await api.get<TrendData[]>('/dashboard/trends', {
      params: { period },
    });
    return response.data;
  },
};
