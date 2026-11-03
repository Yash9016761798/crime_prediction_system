import DashboardStats from './DashboardStats';
import { IndiaHeatmap, CrimeHotspotMap } from './Maps';
import { CrimeTrendChart, CrimeCategoryChart } from './Charts';
import { TopDistricts, AIPredictionSummary } from './Insights';
import { LiveSOSAlerts, RecentFIRsTable } from './AlertsTable';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <DashboardStats />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[400px]">
          <IndiaHeatmap />
        </div>
        <div className="h-[400px]">
          <CrimeTrendChart />
        </div>
        <div className="h-[400px]">
          <LiveSOSAlerts />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[320px]">
          <CrimeCategoryChart />
        </div>
        <div className="h-[320px]">
          <TopDistricts />
        </div>
        <div className="h-[320px]">
          <AIPredictionSummary />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[380px]">
          <RecentFIRsTable />
        </div>
        <div className="h-[380px]">
          <CrimeHotspotMap />
        </div>
      </div>
    </div>
  );
}
