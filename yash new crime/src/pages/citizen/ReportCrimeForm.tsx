import React, { useEffect, useState } from 'react';
import { Camera, MapPin, CheckCircle, Loader2, AlertCircle, Paperclip, X } from 'lucide-react';
import { useCreateCrimeReportMutation } from '../../store/api';
import { apiFetch } from '../../lib/apiClient';
import { useToast } from '../../components/ToastProvider';

const CRIME_TYPES = [
  { value: 'theft', label: 'Theft/Robbery' },
  { value: 'assault', label: 'Assault' },
  { value: 'vandalism', label: 'Vandalism' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other Incident' },
];

const EMPTY_FORM = {
  crimeType: '',
  incidentDate: '',
  location: '',
  district: '',
  state: '',
  description: '',
};

export default function ReportCrimeForm() {
  const { addToast } = useToast();
  const [createCrimeReport, { isLoading: isSubmitting }] = useCreateCrimeReportMutation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [districts, setDistricts] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);

  useEffect(() => {
    apiFetch('/references/districts')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDistricts(d); })
      .catch(() => {});
    apiFetch('/references/states')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStates(d); })
      .catch(() => {});
  }, []);

  const update = (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const descriptionWords = form.description.trim() ? form.description.trim().split(/\s+/).length : 0;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      addToast('File is larger than 50MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiFetch('/upload', { method: 'POST', body });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      setAttachments(prev => [...prev, data.url]);
      addToast(`${data.originalName} attached`, 'success');
    } catch {
      addToast('Could not upload that file', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (descriptionWords > 500) {
      setError('Description must be 500 words or fewer.');
      return;
    }

    try {
      const report = await createCrimeReport({
        crimeType: form.crimeType,
        incidentDate: form.incidentDate,
        location: form.location,
        district: form.district,
        state: form.state,
        description: form.description,
        evidenceUrls: attachments,
        anonymous,
      }).unwrap();
      setSubmittedId(report.id);
      addToast('Report submitted to the local precinct', 'success');
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message;
      setError(message || 'Could not submit your report. Please try again.');
    }
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setAnonymous(false);
    setAttachments([]);
    setError(null);
    setSubmittedId(null);
  };

  if (submittedId) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center py-16">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Report Submitted Successfully</h3>
        <p className="text-slate-600 mb-6 max-w-md">
          Your incident report has been securely transmitted to the local precinct. Your reference
          number is <span className="font-bold text-slate-900">{submittedId}</span>. You can track
          its status under &ldquo;My Reports&rdquo;.
        </p>
        <button onClick={handleReset} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-bold text-slate-900">Submit Crime Report</h3>
        <p className="text-sm text-slate-500 mt-1">Provide details of the incident. You may choose to remain anonymous.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {/* Type & Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="crimeType" className="block text-sm font-medium text-slate-700 mb-1">Crime Type *</label>
            <select
              id="crimeType"
              required
              value={form.crimeType}
              onChange={update('crimeType')}
              className="block w-full border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select Category</option>
              {CRIME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="incidentDate" className="block text-sm font-medium text-slate-700 mb-1">Incident Date *</label>
            <input
              id="incidentDate"
              required
              type="date"
              value={form.incidentDate}
              onChange={update('incidentDate')}
              className="block w-full border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        {/* Location & District */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-1">Location *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="location"
                required
                type="text"
                value={form.location}
                onChange={update('location')}
                className="block w-full pl-10 border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="Landmark or street where it happened"
              />
            </div>
          </div>
          <div>
            <label htmlFor="district" className="block text-sm font-medium text-slate-700 mb-1">District *</label>
            <input
              id="district"
              required
              type="text"
              list="district-options"
              value={form.district}
              onChange={update('district')}
              className="block w-full border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g. Mumbai"
            />
            <datalist id="district-options">
              {districts.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium text-slate-700 mb-1">State / UT</label>
          <input
            id="state"
            type="text"
            list="state-options"
            value={form.state}
            onChange={update('state')}
            className="block w-full border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            placeholder="e.g. Maharashtra"
          />
          <datalist id="state-options">
            {states.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Incident Description *</label>
          <textarea
            id="description"
            required
            rows={4}
            value={form.description}
            onChange={update('description')}
            className="block w-full border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            placeholder="Please describe what happened in detail..."
          />
          <p className="mt-1 flex justify-end text-xs text-slate-500">{descriptionWords}/500 words</p>
        </div>

        {/* Upload Evidence */}
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-slate-700 mb-1">Upload Photo / Video (Optional)</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
            <div className="space-y-1 text-center">
              <Camera className="mx-auto h-8 w-8 text-slate-400" />
              <div className="flex text-sm justify-center gap-1 text-slate-600">
                <span className="cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                  {uploading ? 'Uploading…' : 'Upload a file'}
                </span>
                <p className="pl-1">or drag and drop</p>
              </div>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                accept="image/*,video/*"
                disabled={uploading}
                onChange={handleFile}
                className="sr-only"
              />
              <p className="text-xs text-slate-500">PNG, JPG, MP4 up to 50MB</p>
            </div>
          </div>

          {attachments.length > 0 && (
            <ul className="mt-3 space-y-2">
              {attachments.map((url, i) => (
                <li key={url} className="flex items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <span className="flex items-center gap-2 truncate">
                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{url.split('/').pop()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Anonymity Toggle */}
        <div className="flex items-center justify-between py-4 border-t border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Report Anonymously</h4>
            <p className="text-xs text-slate-500">Your identity details will not be shared with ground officers.</p>
          </div>
          <div className="flex items-center">
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input
                type="checkbox"
                id="toggle"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-slate-300 appearance-none cursor-pointer transition-transform checked:translate-x-5 checked:border-blue-600"
              />
              <label htmlFor="toggle" className="toggle-label block overflow-hidden h-5 rounded-full bg-slate-300 cursor-pointer"></label>
            </div>
          </div>
        </div>

        <style>{`
          .toggle-checkbox:checked { right: 0; border-color: #2563eb; }
          .toggle-checkbox:checked + .toggle-label { background-color: #2563eb; }
        `}</style>

        {/* Submit */}
        <div className="pt-2 border-t border-slate-200">
          <button
            type="submit"
            disabled={isSubmitting || uploading}
            className="w-full sm:w-auto bg-blue-600 border border-transparent rounded-md py-2 px-6 flex items-center justify-center gap-2 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Submitting…' : 'Submit Report securely'}
          </button>
        </div>
      </form>
    </div>
  );
}
