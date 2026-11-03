import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Dashboard from '../../components/dashboard/Dashboard';
import FIRManagement from './FIRManagement';
import SOSMonitoring from './SOSMonitoring';
import CrimeReports from './CrimeReports';
import AIPredictionCenter from './AIPredictionCenter';
import OfficerManagement from './OfficerManagement';
import UserManagement from './UserManagement';
import Analytics from './Analytics';
import CrimeHotspots from './CrimeHotspots';
import CaseManagement from './CaseManagement';
import ReportsExport from './ReportsExport';
import SystemSettings from './SystemSettings';
import IndiaHeatmap from './IndiaHeatmap';
import LiveTracking from './LiveTracking';
import RiskScore from './RiskScore';
import Forecasting from './Forecasting';
import OfficerDispatch from './OfficerDispatch';
import { useAppSelector } from '../../store/hooks';
import { selectCurrentUser } from '../../store/slices/authSlice';

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function AdminDashboard() {
  const user = useAppSelector(selectCurrentUser);
  const displayName = user?.name ?? 'Insp. Rajesh Kumar';

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={
          <>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">National Dashboard Overview</h2>
                <p className="text-sm text-slate-500">Welcome back, <span className="text-blue-600 font-medium">{displayName}</span></p>
              </div>
              <div className="hidden sm:flex items-center gap-3">
                <div className="bg-white border border-slate-200 shadow-sm rounded-md px-4 py-2 flex items-center gap-2">
                  <span className="text-slate-500 text-xs font-medium">{formatDate()}</span>
                </div>
              </div>
            </div>
            <Dashboard />
          </>
        } />
        <Route path="/fir-management" element={<FIRManagement />} />
        <Route path="/sos-monitoring" element={<SOSMonitoring />} />
        <Route path="/crime-reports" element={<CrimeReports />} />
        <Route path="/prediction-center" element={<AIPredictionCenter />} />
        <Route path="/officers" element={<OfficerManagement />} />
        <Route path="/users" element={<UserManagement />} />
        
        <Route path="/heatmap" element={<IndiaHeatmap />} />
        <Route path="/hotspots" element={<CrimeHotspots />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/cases" element={<CaseManagement />} />
        <Route path="/tracking" element={<LiveTracking />} />
        <Route path="/officer-dispatch" element={<OfficerDispatch />} />
        <Route path="/risk" element={<RiskScore />} />
        <Route path="/forecast" element={<Forecasting />} />
        <Route path="/reports" element={<ReportsExport />} />
        <Route path="/settings" element={<SystemSettings />} />

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AppLayout>
  );
}

