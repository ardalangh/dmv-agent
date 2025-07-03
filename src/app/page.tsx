import { useState, useEffect } from 'react';

interface TicketResponse {
  category: string;
  status: 'complete' | 'incomplete';
  missingDocs: string[];
  ticketType: string;
}

const STATES = ['CA', 'NY', 'TX'];

const SERVICES: Record<string, string[]> = {
  CA: [
    'Apply for a new standard driver license',
    'Renew driver license or CDL',
  ],
  NY: [
    'Apply for a new standard driver license',
    'Renew driver license or CDL',
  ],
  TX: [
    'Apply for a new standard driver license',
    'Renew driver license or CDL',
  ],
};

export default function Home() {
  const [state, setState] = useState('CA');
  const [service, setService] = useState(SERVICES['CA'][0]);
  const [docs, setDocs] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TicketResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setService(SERVICES[state][0]);
    setDocs(['']);
    setResult(null);
    setError('');
  }, [state]);

  const handleDocChange = (idx: number, value: string) => {
    setDocs((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const addDocField = () => setDocs((prev) => [...prev, '']);
  const removeDocField = (idx: number) => setDocs((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, service, providedDocs: docs.filter(Boolean) }),
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError('Failed to generate ticket.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-3xl font-bold mb-6 text-blue-700">DMV Agent Ticket Generator</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 w-full max-w-md flex flex-col gap-4">
        <label className="font-medium">State
          <select
            className="block w-full mt-1 border rounded px-2 py-1"
            value={state}
            onChange={e => setState(e.target.value)}
          >
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="font-medium">Service
          <select
            className="block w-full mt-1 border rounded px-2 py-1"
            value={service}
            onChange={e => setService(e.target.value)}
          >
            {SERVICES[state].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div>
          <span className="font-medium">Provided Documents</span>
          {docs.map((doc, idx) => (
            <div key={idx} className="flex gap-2 mt-1">
              <input
                className="flex-1 border rounded px-2 py-1"
                type="text"
                placeholder="e.g. Proof of identity"
                value={doc}
                onChange={e => handleDocChange(idx, e.target.value)}
                required={idx === 0}
              />
              {docs.length > 1 && (
                <button type="button" className="text-red-500" onClick={() => removeDocField(idx)} title="Remove">&times;</button>
              )}
            </div>
          ))}
          <button type="button" className="mt-2 text-blue-600 hover:underline" onClick={addDocField}>+ Add another document</button>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Checking...' : 'Generate Ticket'}
        </button>
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </form>
      {result && (
        <div className="mt-8 bg-white shadow-lg rounded-lg p-6 w-full max-w-md">
          <h2 className="text-xl font-bold mb-2 text-green-700">Ticket Result</h2>
          <div className="mb-1"><span className="font-medium">Category:</span> {result.category}</div>
          <div className="mb-1"><span className="font-medium">Ticket Type:</span> {result.ticketType}</div>
          <div className="mb-1"><span className="font-medium">Status:</span> <span className={result.status === 'complete' ? 'text-green-600' : 'text-yellow-600'}>{result.status}</span></div>
          {result.missingDocs.length > 0 && (
            <div className="mt-2">
              <span className="font-medium text-red-600">Missing Documents:</span>
              <ul className="list-disc list-inside text-red-600">
                {result.missingDocs.map((doc, i) => <li key={i}>{doc}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
