import { useState } from 'react';

export default function StartChatPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartChat = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: '' }), // Optionally collect intent from user
      });
      if (!res.ok) throw new Error('Failed to start chat');
      const data = await res.json();
      setSessionId(data.sessionId);
    } catch (err) {
      setError('Could not start chat.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-4">Start a New Chat</h1>
        <button
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full font-semibold text-lg shadow hover:from-blue-600 hover:to-purple-600 transition mb-4"
          onClick={handleStartChat}
          disabled={loading}
        >
          {loading ? 'Starting...' : 'Start Chat'}
        </button>
        {sessionId && (
          <div className="mt-4 text-green-700 font-semibold">
            Chat started! Session ID: <span className="font-mono">{sessionId}</span>
          </div>
        )}
        {error && <div className="mt-4 text-red-600">{error}</div>}
      </div>
    </div>
  );
} 