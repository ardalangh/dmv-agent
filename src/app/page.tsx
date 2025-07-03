"use client";

import { useState, useRef, useEffect, ChangeEvent } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileName?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant' as const, content: 'Hello! I am your DMV Agent. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() && !file) return;
    setError('');
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    if (file) {
      fileUrl = URL.createObjectURL(file);
      fileName = file.name;
    }
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: input, fileUrl, fileName },
    ];
    setMessages(newMessages);
    setInput('');
    setFile(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError('Failed to get response.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) sendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-3xl font-bold mb-6 text-blue-700">DMV Agent Chat</h1>
      <div className="w-full max-w-md bg-white shadow-md rounded-lg flex flex-col h-[70vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-line text-sm
                  ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}
              >
                {msg.content}
                {msg.fileName && (
                  <div className="mt-2">
                    <span className="block text-xs font-semibold">📄 {msg.fileName}</span>
                    {msg.fileUrl && (
                      <object data={msg.fileUrl} type="application/pdf" width="100%" height="120" className="mt-1 rounded border" aria-label={msg.fileName}>
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">View PDF</a>
                      </object>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form
          className="flex items-center border-t p-2 gap-2"
          onSubmit={e => {
            e.preventDefault();
            if (!isLoading) sendMessage();
          }}
        >
          <input
            className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isLoading}
            autoFocus
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={isLoading}
            className="text-xs"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50"
            disabled={isLoading || (!input.trim() && !file)}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
        {error && <div className="text-red-600 text-sm p-2">{error}</div>}
      </div>
    </div>
  );
}
