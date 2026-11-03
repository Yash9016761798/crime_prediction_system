import { AlertTriangle, Map, Navigation, Bell, Camera, User, List } from 'lucide-react';
import { Link, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import ReportCrimeForm from './ReportCrimeForm';
import SafeRouteNavigation from './SafeRouteNavigation';
import CrimeAlertsFeed from './CrimeAlertsFeed';
import NearbyServices from './NearbyServices';
import MyReports from './MyReports';

function CitizenOverview() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  return (
    <>
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Stay Safe, Rahul</h2>
          <p className="text-slate-600 mb-6">Your local area (Gandhinagar) is currently <span className="text-green-600 font-semibold">Safe</span>.</p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => navigate('/citizen/alerts')}>
            <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-blue-900">Recent Alert Near You</h4>
              <p className="text-xs text-blue-700 mt-1">Minor traffic incident reported 2km away at SG Highway. Route clear.</p>
            </div>
          </div>
        </div>
        
        <div className="w-full md:w-72 bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h3 className="text-red-900 font-bold mb-4 uppercase tracking-widest text-sm relative z-10">Emergency</h3>
          <button onClick={() => addToast('EMERGENCY SOS DISPATCHED TO LOCATION.', 'error')} className="w-32 h-32 rounded-full bg-red-600 hover:bg-red-700 shadow-xl shadow-red-500/30 flex items-center justify-center text-white font-black text-2xl tracking-wider transition-transform active:scale-95 border-4 border-red-200 relative z-10">
            SOS
          </button>
          <p className="text-xs text-red-600 mt-4 opacity-80 relative z-10">Tap once to alert precise location to local authorities.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/citizen/report" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 block group">
          <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-900 mb-2">Report Crime</h4>
          <p className="text-xs text-slate-500">Log an incident anonymously or with your details. Upload photos/videos.</p>
        </Link>

        <Link to="/citizen/safe-route" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 block group">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Navigation className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-900 mb-2">Safe Route</h4>
          <p className="text-xs text-slate-500">Navigate to your destination avoiding active crime hotspots.</p>
        </Link>

        <Link to="/citizen/nearby" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 block group">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Map className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-900 mb-2">Nearby Services</h4>
          <p className="text-xs text-slate-500">Locate the nearest police stations, hospitals, and emergency centers.</p>
        </Link>

        <Link to="/citizen/reports" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 block group">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <List className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-900 mb-2">My Reports</h4>
          <p className="text-xs text-slate-500">Check the ongoing investigation status of your submitted FIRs.</p>
        </Link>
      </div>
    </>
  );
}

export default function CitizenDashboard() {
  const location = useLocation();
  const { addToast } = useToast();
  const isHome = location.pathname === '/citizen' || location.pathname === '/citizen/';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/citizen" className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white hover:bg-blue-700 transition shadow-sm">
              C
            </Link>
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-900 tracking-tight">CITIZEN PORTAL</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Safety & Reporting</p>
            </div>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
            <Link to="/citizen" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <Link to="/citizen/alerts" className="hover:text-blue-600 transition-colors relative">
               Alerts
               <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-red-500"></span>
            </Link>
            <Link to="/citizen/report" className="hover:text-blue-600 transition-colors">File Report</Link>
          </nav>
          <div className="flex items-center gap-4">
            <button onClick={() => addToast('Opening notifications panel...')} className="md:hidden relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            </button>
            <div onClick={() => addToast('Opening user profile menu...')} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors shadow-sm">
              <User className="w-4 h-4" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {!isHome && (
          <div className="mb-6">
             <Link to="/citizen" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors">
               ← Back to Dashboard
             </Link>
          </div>
        )}
        
        <Routes>
          <Route path="/" element={<CitizenOverview />} />
          <Route path="/report" element={<ReportCrimeForm />} />
          <Route path="/safe-route" element={<SafeRouteNavigation />} />
          <Route path="/alerts" element={
            <div className="h-[600px] max-w-2xl mx-auto">
               <CrimeAlertsFeed />
            </div>
          } />
          <Route path="/nearby" element={
            <div className="h-[600px] max-w-2xl mx-auto">
               <NearbyServices />
            </div>
          } />
          <Route path="/reports" element={<MyReports />} />
        </Routes>
      </main>
    </div>
  );
}
