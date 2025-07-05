"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  fileUrl?: string;
  fileName?: string;
  docStatus?: "correct" | "incorrect";
  docGuess?: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I am your DMV Agent. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [expectedType, setExpectedType] = useState("");
  const [showTypePrompt, setShowTypePrompt] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const currentPath = usePathname();
  const sessionId = currentPath.split("/").pop();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setShowTypePrompt(true);
    } else {
      setFile(null);
    }
  };

  const handleTypePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowTypePrompt(false);
    sendMessage();
  };

  const sendMessage = async () => {
    if (!input.trim() && !file) return;
    setError("");
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    if (file) {
      fileUrl = URL.createObjectURL(file);
      fileName = file.name;
    }
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input, fileUrl, fileName },
    ];
    setMessages(newMessages);
    setInput("");
    setFile(null);
    setIsLoading(true);
    try {
      if (file) {
        // Send file to /api/verify-doc
        const formData = new FormData();
        formData.append("file", file);
        formData.append("expectedType", expectedType || "");
        formData.append("session_id", String(sessionId));

        const res = await fetch("/api/verify-doc", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        // Parse LLM result
        let docStatus: "correct" | "incorrect" = "incorrect";
        let docGuess = "";
        const reply = data.result as string;
        if (/\bYES\b/i.test(reply)) {
          docStatus = "correct";
        } else {
          // Try to extract guessed type from reply
          const match = reply.match(/document type is:?\s*([\w\s]+)/i);
          if (match) docGuess = match[1].trim();
        }
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              docStatus === "correct"
                ? "✅ Your document matches the expected type!"
                : `⚠️ The document you submitted appears to be: ${
                    docGuess || "something else"
                  }. Please upload the required document: ${expectedType}.`,
            docStatus,
            docGuess,
          },
        ]);
        setExpectedType("");
      }
      // Normal chat
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, sessionId }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError("Failed to get response.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) sendMessage();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-100 font-sans">
      <div className="w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl rounded-3xl bg-white/80 backdrop-blur-md border border-blue-100">
        {/* Header */}
        <div className="rounded-t-3xl bg-gradient-to-r from-blue-600 via-blue-500 to-purple-500 p-6 text-center">
          <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-lg">
            DMV Agent Chat
          </h1>
        </div>
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`relative px-5 py-3 max-w-[75%] text-base rounded-2xl shadow transition-all
                  ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-blue-500 to-purple-400 text-white rounded-br-md animate-fadeInRight"
                      : "bg-gray-100 text-gray-900 rounded-bl-md animate-fadeInLeft"
                  }
                `}
              >
                {msg.content}
                {msg.docStatus === "correct" && (
                  <span className="ml-2 text-green-600 text-xl align-middle">
                    ✔️
                  </span>
                )}
                {msg.docStatus === "incorrect" && (
                  <span className="ml-2 text-yellow-600 text-xl align-middle">
                    ⚠️
                  </span>
                )}
                {msg.fileName && (
                  <div className="mt-2">
                    <span className="block text-xs font-semibold">
                      📄 {msg.fileName}
                    </span>
                    {msg.fileUrl && (
                      <object
                        data={msg.fileUrl}
                        type="application/pdf"
                        width="100%"
                        height="120"
                        className="mt-1 rounded border"
                        aria-label={msg.fileName}
                      >
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View PDF
                        </a>
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
          onSubmit={(e) => {
            e.preventDefault();
            if (!isLoading) {
              if (file && !expectedType) {
                setShowTypePrompt(true);
              } else {
                sendMessage();
              }
            }
          }}
        >
          <input
            className="flex-1 border border-blue-400 rounded-full px-4 py-3 text-base bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
              accept="application/pdf,image/png,image/jpeg"
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
            {isLoading ? "..." : "Send"}
          </button>
        </form>
        {showTypePrompt && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
            <form
              className="bg-white rounded-2xl shadow-lg p-8 flex flex-col gap-4 min-w-[320px]"
              onSubmit={handleTypePromptSubmit}
            >
              <label className="font-semibold text-lg text-gray-700">
                What is the expected document type?
              </label>
              <input
                className="border border-blue-400 rounded-full px-4 py-2 text-base bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                type="text"
                placeholder="e.g. Proof of Address, Passport, etc."
                value={expectedType}
                onChange={(e) => setExpectedType(e.target.value)}
                required
                autoFocus
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full px-6 py-2 font-bold shadow hover:from-blue-600 hover:to-purple-600 transition"
              >
                Continue
              </button>
            </form>
          </div>
        )}
        {error && (
          <div className="text-red-600 text-sm p-2 text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
