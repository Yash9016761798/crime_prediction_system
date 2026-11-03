import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, PhoneCall, Map, Users, ArrowRight, HeartPulse } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">
              C
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-900 tracking-tight">CRIME INTEL</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Public Information</p>
            </div>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#statistics" className="hover:text-blue-600 transition-colors">Statistics</a>
            <a href="#safety-tips" className="hover:text-blue-600 transition-colors">Safety Tips</a>
            <a href="#emergency" className="hover:text-blue-600 transition-colors">Emergency Contacts</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/citizen-login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Citizen Login</Link>
            <Link to="/admin-login" className="text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">Admin Portal</Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden bg-slate-900 text-slate-50 py-20 lg:py-32">
          <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1555848962-6e79363ec58f?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10text-center lg:text-left flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold tracking-wider uppercase mb-6">Data-Driven Safety</span>
              <h2 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                Protecting Communities <br/> Through <span className="text-blue-400">Intelligence</span>
              </h2>
              <p className="text-lg text-slate-400 mb-8 max-w-2xl leading-relaxed">
                Crime prediction and analysis platform equipping law enforcement and citizens with historical NCRB statistics, SOS alerts, and district-level hotspot rankings.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/citizen-login" className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors">
                  Report a Crime <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#emergency" className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-md font-semibold transition-colors">
                  Emergency SOS <AlertTriangle className="w-4 h-4" />
                </a>
              </div>
            </div>
            
            <div className="flex-1 w-full lg:w-auto">
              <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 p-6 rounded-xl shadow-2xl">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-sm font-bold">National Threat Level</h3>
                   <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Stable</span>
                 </div>
                 <div className="space-y-4">
                   <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-xs text-slate-400">Total Solved Cases (Yearly)</span>
                        <HeartPulse className="w-4 h-4 text-blue-400" />
                     </div>
                     <span className="text-2xl font-bold">142,504</span>
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-xs text-slate-400">Avg. Response Time</span>
                       <AlertTriangle className="w-4 h-4 text-orange-400" />
                     </div>
                     <span className="text-2xl font-bold">12.5 mins</span>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* Emergency Contacts Section */}
        <section id="emergency" className="py-16 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Crucial Emergency Numbers</h3>
              <p className="text-slate-500 max-w-2xl mx-auto">Keep these numbers handy. In case of an emergency, do not hesitate to call immediately.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { number: '112', label: 'National Emergency', color: 'bg-red-50 text-red-700 border-red-200', icon: PhoneCall },
                { number: '100', label: 'Police', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Shield },
                { number: '1091', label: 'Women Helpline', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Users },
                { number: '108', label: 'Ambulance', color: 'bg-green-50 text-green-700 border-green-200', icon: HeartPulse },
              ].map((em, i) => (
                <div key={i} className={`p-6 rounded-lg border ${em.color} flex flex-col items-center text-center`}>
                  <em.icon className="w-8 h-8 mb-4 opacity-80" />
                  <span className="text-3xl font-black mb-1">{em.number}</span>
                  <span className="text-sm font-semibold uppercase tracking-wider opacity-90">{em.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Preview */}
        <section id="features" className="py-20 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Comprehensive Portals</h3>
              <p className="text-slate-500 max-w-2xl mx-auto">Tailored experiences for law enforcement officials and general public.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="w-12 h-12 bg-slate-900 text-white rounded-lg flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 mb-3">Admin & Police Dashboard</h4>
                <p className="text-slate-600 mb-6 min-h-[80px]">
                  District-level heatmap visualizations, SOS monitoring, FIR management, and statistical crime forecasting built on the 2001-2012 NCRB dataset.
                </p>
                <Link to="/admin-login" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  Access Dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-6">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 mb-3">Citizen Safety Portal</h4>
                <p className="text-slate-600 mb-6 min-h-[80px]">
                  Anonymous crime reporting, safe routing navigation, live alert notifications, and quick emergency access.
                </p>
                <Link to="/citizen-login" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  Access Portal <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

            </div>
          </div>
        </section>

      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm">
        <p>© 2026 Crime Intelligence System. All rights reserved.</p>
      </footer>
    </div>
  );
}
