import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Download, FileText, Loader2, BarChart3, Brain, ClipboardList, Shield,
  RefreshCw, Clock, CheckCircle, AlertCircle, Database, FileSpreadsheet, File,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import {
  useExportDataMutation,
  useGenerateReportMutation,
  useGetReportHistoryQuery,
  useDownloadReportMutation,
} from '../../store/api';
import type { GeneratedReport } from '../../types/api';

const REPORT_TYPES = [
  { id: 'dashboard', label: 'Dashboard Summary', icon: BarChart3, description: 'System-wide statistics and KPIs', dataSources: ['FIR Management', 'Case Management', 'Crime Reports', 'SOS Alerts', 'Officer Management'] },
  { id: 'analytics', label: 'Analytics Report', icon: Database, description: 'Crime trends, distributions, and comparisons', dataSources: ['Historical Crime Data', 'State/District Analysis', 'Year-over-Year Trends'] },
  { id: 'predictions', label: 'Predictions Report', icon: Brain, description: 'Statistical forecasts, relative risk scores, and district hotspots', dataSources: ['Crime Prediction Center', 'Risk Score Analysis', 'Crime Forecasting'] },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList, description: 'System activity and user actions', dataSources: ['User Actions', 'System Events', 'Administrative Changes'] },
];

const EXPORT_ENTITIES = [
  { id: 'firs', label: 'FIR Data', icon: FileText },
  { id: 'cases', label: 'Case Data', icon: ClipboardList },
  { id: 'officers', label: 'Officer Data', icon: Shield },
  { id: 'users', label: 'User Data', icon: FileText },
  { id: 'crime-reports', label: 'Crime Reports', icon: FileText },
  { id: 'sos-alerts', label: 'SOS Alerts', icon: AlertCircle },
];

const EXPORT_FORMATS = [
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet, description: 'Spreadsheet-compatible' },
  { id: 'excel', label: 'EXCEL', icon: FileSpreadsheet, description: 'Microsoft Excel format' },
  { id: 'pdf', label: 'PDF', icon: File, description: 'Print-ready document' },
] as const;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ReportsExport() {
  const { addToast } = useToast();
  const [selectedType, setSelectedType] = useState('dashboard');
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [selectedEntity, setSelectedEntity] = useState('firs');
  const [activeTab, setActiveTab] = useState<'reports' | 'exports'>('reports');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const [exportData, { isLoading: isExporting }] = useExportDataMutation();
  const [generateReport, { isLoading: isGenerating }] = useGenerateReportMutation();
  const { data: reportHistory, isLoading: historyLoading, refetch: refetchHistory } = useGetReportHistoryQuery();
  const [downloadReport, { isLoading: isDownloading }] = useDownloadReportMutation();

  const handleGenerateReport = useCallback(async () => {
    try {
      const blob = await generateReport({ reportType: selectedType as 'dashboard' | 'analytics' | 'predictions' | 'audit', format: selectedFormat as 'csv' | 'excel' | 'pdf' }).unwrap();
      const ts = new Date().toISOString().slice(0, 10);
      const filename = `${selectedType}_report_${ts}.csv`;
      triggerDownload(blob, filename);
      addToast(`${REPORT_TYPES.find(t => t.id === selectedType)?.label} generated and downloaded`, 'success');
      refetchHistory();
    } catch {
      addToast('Failed to generate report', 'error');
    }
  }, [selectedType, selectedFormat, generateReport, addToast, refetchHistory]);

  const handleExportData = useCallback(async () => {
    try {
      const blob = await exportData({ format: selectedFormat as 'csv' | 'excel' | 'pdf' | 'json', entityType: selectedEntity as 'firs' | 'cases' | 'users' | 'officers' | 'crime-reports' | 'sos-alerts' }).unwrap();
      const ts = new Date().toISOString().slice(0, 10);
      const filename = `${selectedEntity}_export_${ts}.csv`;
      triggerDownload(blob, filename);
      addToast(`${EXPORT_ENTITIES.find(e => e.id === selectedEntity)?.label} exported successfully`, 'success');
      refetchHistory();
    } catch {
      addToast('Failed to export data', 'error');
    }
  }, [selectedFormat, selectedEntity, exportData, addToast, refetchHistory]);

  const handleDownloadFromHistory = useCallback(async (report: GeneratedReport) => {
    try {
      const blob = await downloadReport(report.id).unwrap();
      const filename = `${report.title.replace(/\s+/g, '_')}.csv`;
      triggerDownload(blob, filename);
      addToast(`Downloading "${report.title}"`, 'success');
    } catch {
      addToast('Failed to download report', 'error');
    }
  }, [downloadReport, addToast]);

  const isLoading = isExporting || isGenerating;
  const currentType = REPORT_TYPES.find(t => t.id === selectedType);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">Reports & Export</h2>
          <p className="text-sm text-slate-500">Generate, view, and download operational reports from all modules</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{reportHistory?.length ?? 0} reports generated</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Report Generation */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab selector: Reports vs Data Export */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setActiveTab('reports')} className={cn("flex-1 px-4 py-3 text-sm font-medium transition-colors", activeTab === 'reports' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
                <BarChart3 className="w-4 h-4 inline mr-2" /> Module Reports
              </button>
              <button onClick={() => setActiveTab('exports')} className={cn("flex-1 px-4 py-3 text-sm font-medium transition-colors", activeTab === 'exports' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
                <Download className="w-4 h-4 inline mr-2" /> Data Export
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'reports' ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Report Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {REPORT_TYPES.map(rt => {
                        const Icon = rt.icon;
                        return (
                          <button key={rt.id} onClick={() => setSelectedType(rt.id)} className={cn("p-4 rounded-lg border-2 text-left transition-all", selectedType === rt.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                            <div className="flex items-center gap-3 mb-2">
                              <div className={cn("p-2 rounded-md", selectedType === rt.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500')}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className={cn("text-sm font-semibold", selectedType === rt.id ? 'text-blue-700' : 'text-slate-700')}>{rt.label}</span>
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{rt.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {rt.dataSources.map(ds => (
                                <span key={ds} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{ds}</span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Export Format</label>
                    <div className="flex gap-3">
                      {EXPORT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setSelectedFormat(f.id)} className={cn("flex-1 px-4 py-3 rounded-lg border-2 text-center transition-all", selectedFormat === f.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                          <span className="text-sm font-bold uppercase block">{f.label}</span>
                          <span className="text-[10px] text-slate-400">{f.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleGenerateReport} disabled={isLoading} className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Generate & Download {currentType?.label}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Data Source</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {EXPORT_ENTITIES.map(ent => {
                        const Icon = ent.icon;
                        return (
                          <button key={ent.id} onClick={() => setSelectedEntity(ent.id)} className={cn("p-3 rounded-lg border-2 text-left transition-all flex items-center gap-2", selectedEntity === ent.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                            <Icon className={cn("w-4 h-4", selectedEntity === ent.id ? 'text-blue-600' : 'text-slate-400')} />
                            <span className={cn("text-sm font-medium", selectedEntity === ent.id ? 'text-blue-700' : 'text-slate-600')}>{ent.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Export Format</label>
                    <div className="flex gap-3">
                      {EXPORT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setSelectedFormat(f.id)} className={cn("flex-1 px-4 py-3 rounded-lg border-2 text-center transition-all", selectedFormat === f.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                          <span className="text-sm font-bold uppercase block">{f.label}</span>
                          <span className="text-[10px] text-slate-400">{f.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleExportData} disabled={isLoading} className="w-full bg-emerald-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export {EXPORT_ENTITIES.find(e => e.id === selectedEntity)?.label}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Report History */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Generated Reports</h3>
            <button onClick={() => refetchHistory()} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {historyLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-lg" />)}
              </div>
            ) : !reportHistory || reportHistory.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No reports generated yet</p>
                <p className="text-xs text-slate-300 mt-1">Generate a report to see it here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reportHistory.map((report) => (
                  <div key={report.id} className="px-4 py-3 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={cn("p-1.5 rounded-md mt-0.5", report.type === 'dashboard' ? 'bg-blue-100 text-blue-600' : report.type === 'analytics' ? 'bg-emerald-100 text-emerald-600' : report.type === 'predictions' ? 'bg-purple-100 text-purple-600' : report.type === 'audit' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600')}>
                          {report.type === 'dashboard' ? <BarChart3 className="w-3.5 h-3.5" /> : report.type === 'analytics' ? <Database className="w-3.5 h-3.5" /> : report.type === 'predictions' ? <Brain className="w-3.5 h-3.5" /> : report.type === 'audit' ? <ClipboardList className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{report.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400">{formatDate(report.createdAt)}</span>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">{report.size}</span>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="text-[10px] font-medium text-slate-500 uppercase">{report.format}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleDownloadFromHistory(report)} disabled={isDownloading} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
