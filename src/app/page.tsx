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
    { role: 'assistant', content: 'Hello! I am your DMV Agent. How can I help you today?' },
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
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-100 font-sans">
      <div className="w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl rounded-3xl bg-white/80 backdrop-blur-md border border-blue-100">
        {/* Header */}
        <div className="rounded-t-3xl bg-gradient-to-r from-blue-600 via-blue-500 to-purple-500 p-6 text-center">
          <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-lg">DMV Agent Chat</h1>
        </div>
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`relative px-5 py-3 max-w-[75%] text-base rounded-2xl shadow transition-all
                  ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-purple-400 text-white rounded-br-md animate-fadeInRight'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md animate-fadeInLeft'}
                `}
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
        {/* Input Area */}
        <form
          className="flex items-center gap-3 border-t border-blue-100 bg-white/70 p-4 rounded-b-3xl"
          onSubmit={e => {
            e.preventDefault();
            if (!isLoading) sendMessage();
          }}
        >
          <input
            className="flex-1 border border-blue-400 rounded-full px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isLoading}
            autoFocus
          />
          {/* Custom File Input */}
          <label
            htmlFor="file-upload"
            className="cursor-pointer bg-blue-100 text-blue-700 font-semibold px-4 py-2 rounded-full hover:bg-blue-200 transition shadow-sm"
          >
            Choose File
            <input
              id="file-upload"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={isLoading}
              className="hidden"
            />
          </label>
          <span className="ml-2 text-gray-400 text-sm min-w-[100px] truncate">
            {file ? file.name : "No file chosen"}
          </span>
          <button
            type="submit"
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full px-6 py-3 font-bold shadow hover:from-blue-600 hover:to-purple-600 transition disabled:opacity-50"
            disabled={isLoading || (!input.trim() && !file)}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
        {error && <div className="text-red-600 text-sm p-2 text-center">{error}</div>}
      </div>
      {/* Custom Animations */}
      <style jsx global>{`
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fadeInRight { animation: fadeInRight 0.4s; }
        .animate-fadeInLeft { animation: fadeInLeft 0.4s; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e0e7ff; border-radius: 8px; }
      `}</style>
    </div>
  );
}
