import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CrimeIntelChatbot from '../chatbot/CrimeIntelChatbot';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800 font-sans">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {children}
        </main>
      </div>
      <CrimeIntelChatbot />
    </div>
  );
}
