import { 
  BarChart3, Map, Siren, FileText, 
  MapPin, Users, Settings, FileSearch, PieChart,
  Target, Download, AlertTriangle, Shield, Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { NavLink, useLocation } from 'react-router-dom';
import { useFetchSOSAlertsQuery } from '../../store/api';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  alert?: boolean;
  alertCount?: number;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

export default function Sidebar() {
  const location = useLocation();
  const { data: sosData } = useFetchSOSAlertsQuery(
    { page: 1, pageSize: 1, status: 'pending' },
    { pollingInterval: 30000 }
  );
  const sosPendingCount = sosData?.total ?? 0;

  const navigation: NavGroup[] = [
    {
      title: 'Dashboard',
      items: [
        { name: 'Dashboard', href: '/admin', icon: PieChart },
      ]
    },
    {
      title: 'Crime Monitoring',
      items: [
        { name: 'India Heatmap', href: '/admin/heatmap', icon: Map },
        { name: 'Hotspots', href: '/admin/hotspots', icon: Target },
        { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      ]
    },
    {
      title: 'Case Management',
      items: [
        { name: 'FIR Management', href: '/admin/fir-management', icon: FileText },
        { name: 'Case Management', href: '/admin/cases', icon: FileSearch },
        { name: 'Crime Reports', href: '/admin/crime-reports', icon: Shield },
      ]
    },
    {
      title: 'Emergency Center',
      items: [
        { name: 'SOS Monitoring', href: '/admin/sos-monitoring', icon: Siren, alert: true, alertCount: sosPendingCount },
        { name: 'Live Tracking', href: '/admin/tracking', icon: MapPin },
        { name: 'Officer Dispatch', href: '/admin/officer-dispatch', icon: Activity },
      ]
    },
    {
      title: 'Crime Intelligence',
      items: [
        { name: 'Crime Prediction', href: '/admin/prediction-center', icon: AlertTriangle },
        { name: 'Risk Score', href: '/admin/risk', icon: Target },
        { name: 'Forecasting', href: '/admin/forecast', icon: BarChart3 },
      ]
    },
    {
      title: 'Management',
      items: [
        { name: 'Officers', href: '/admin/officers', icon: Users },
        { name: 'Users', href: '/admin/users', icon: Users },
      ]
    },
    {
      title: 'Reports',
      items: [
        { name: 'Reports & Export', href: '/admin/reports', icon: Download },
      ]
    },
    {
      title: 'Settings',
      items: [
        { name: 'Settings', href: '/admin/settings', icon: Settings },
      ]
    }
  ];

  return (
    <div className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col h-full flex-shrink-0 text-slate-50">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">
            P
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-white tracking-tight">CRIME INTEL</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">ADMINISTRATION v2.4</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {navigation.map((group, i) => (
          <div key={i} className="mb-6">
            <h2 className="px-6 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {group.title}
            </h2>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/admin'}
                  className={({ isActive }) => cn(
                    "w-full flex items-center justify-between px-6 py-3 text-[13.5px] transition-all border-l-4",
                    isActive
                      ? "bg-slate-800 text-blue-500 border-blue-500" 
                      : "border-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  {item.alert && item.alertCount != null && item.alertCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                      {item.alertCount > 99 ? '99+' : String(item.alertCount).padStart(2, '0')}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center" />
          <div className="text-left">
            <p className="text-xs font-semibold text-white">Insp. Rajesh Kumar</p>
            <p className="text-[10px] text-slate-400">Mumbai HQ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
