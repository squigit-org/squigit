import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, AlertCircle, Terminal, Bot, MessageCircle, ChevronUp, Sparkles } from 'lucide-react';
import { Message, ModelType, MODELS } from './types';
import { initializeGemini, startNewChatStream, sendMessage } from './services/geminiService';
import { ChatBubble } from './components/ChatBubble';
import { ModelSelector } from './components/ModelSelector';

const SHIMMER_DURATION = 3000;

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const StreamingResponse: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [text]);

  return (
    <div className="text-neutral-300 leading-relaxed space-y-4 mt-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      <div ref={messagesEndRef} />
    </div>
  );
};

const SAVED_PROMPT = 'Analyze this image in detail. Describe the composition, colors, and potential context.';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentModel, setCurrentModel] = useState<string>(ModelType.GEMINI_2_5_FLASH);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [startupImage, setStartupImage] = useState<{ base64: string; mimeType: string } | null>(null);

  const [isChatMode, setIsChatMode] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstResponseId, setFirstResponseId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const loadEnvironment = async () => {
      try {
        let key = '';
        let imgData: { base64: string; mimeType: string } | null = null;

        if ((window as any).electronAPI) {
          key = await (window as any).electronAPI.getApiKey();
          imgData = await (window as any).electronAPI.getStartupImage();
        }

        if (!key) {
          setError('API Key not found in config.private.json');
          return;
        }

        setApiKey(key);
        initializeGemini(key);

        if (imgData) {
          setStartupImage(imgData);
          startSession(key, currentModel, imgData);
        } else {
          if ((window as any).electronAPI && (window as any).electronAPI.exitApp) {
            try {
              await (window as any).electronAPI.exitApp(1);
            } catch (e) {
              window.close();
            }
          } else {
            window.close();
          }
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load configuration.');
      }
    };
    loadEnvironment();
  }, []);



  const resetInitialUi = () => {
    setStreamingText('');
    setIsChatMode(false);
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: { base64: string; mimeType: string } | null,
    isRetry = false
  ) => {
    if (!key || !imgData) return;

    if (!isRetry) {
      resetInitialUi();
      setMessages([]);
      setIsLoading(true);
      setError(null);
      setFirstResponseId(null);
    }
    
    setIsStreaming(true);

    try {
      let fullResponse = '';
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      await startNewChatStream(modelId, imgData.base64, SAVED_PROMPT, (token: string) => {
        fullResponse += token;
        setStreamingText(fullResponse);
      });

      setIsStreaming(false);
      setIsLoading(false);
    } catch (apiError: any) {
      console.error(apiError);

      if (!isRetry && (apiError.message?.includes('429') || apiError.message?.includes('503'))) {
          console.log('Model failed, trying lite version...');
          setCurrentModel(ModelType.GEMINI_FLASH_LITE);
          startSession(key, ModelType.GEMINI_FLASH_LITE, imgData, true);
          return;
      }

      let errorMsg = 'Failed to connect to Gemini.';
      if (apiError.message?.includes('429')) errorMsg = 'Quota limit reached or server busy.';
      else if (apiError.message?.includes('503')) errorMsg = 'Service temporarily unavailable.';
      else if (apiError.message) errorMsg = apiError.message;

      setError(errorMsg);
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const handleModelChange = (newModel: string) => {
    setCurrentModel(newModel);
    if (startupImage) {
      startSession(apiKey, newModel, startupImage);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');

    if (!isChatMode) {
      setIsChatMode(true);
      if (streamingText && firstResponseId) {
        const botMsg: Message = {
          id: firstResponseId,
          role: 'model',
          text: streamingText,
          timestamp: Date.now(),
        };
        setMessages([botMsg]);
        setStreamingText('');
        setFirstResponseId(null);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const responseText = await sendMessage(userText);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
    scrollToBottom();
    } catch (apiError: any) {
      setError('Failed to send message. ' + (apiError.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500/30 selection:text-white">
      <header className="flex items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <img src="assets/gem.svg" alt="Gem Icon" className="h-6 w-6" />
            <span className="text-lg font-semibold text-neutral-200">AI Overview</span>
          </div>
          <div>
            <ModelSelector
              currentModel={currentModel}
              onModelChange={handleModelChange}
              isLoading={isLoading}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <main>
<div className="mx-auto w-full max-w-4xl px-4 md:px-8">
            {startupImage && !isChatMode && (
              <div className="min-h-[60vh]">
                {isLoading && !streamingText ? (
                  <div className="space-y-4 pt-8" aria-hidden="true">
                    <div className="shimmer-line shimmer-line-1 w-3/4" />
                    <div className="shimmer-line shimmer-line-2 w-full" />
                    <div className="shimmer-line shimmer-line-3 w-full" />
                    <div className="shimmer-line shimmer-line-4 w-5/6" />
                    <div className="shimmer-line shimmer-line-5 w-1/2" />
                    <div className="shimmer-line shimmer-line-6 w-3/4" />
                    <div className="shimmer-line shimmer-line-7 w-4/5" />
                    <div className="shimmer-line shimmer-line-8 w-2/3" />
                  </div>
                ) : (
                  <StreamingResponse text={streamingText} />
                )}
              </div>
            )}

            {isChatMode && (
              <div className="space-y-8">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {error && (
              <div className="mt-10 flex items-center gap-3 rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button
                  onClick={() => startSession(apiKey, currentModel, startupImage)}
                  disabled={!startupImage}
                  className="ml-auto rounded-full border border-red-900/50 px-3 py-1 text-xs text-red-200 transition-colors hover:border-red-500/60 disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {startupImage && (
        <footer className="border-t border-neutral-900/80 bg-neutral-950/95 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 md:px-8">
            <div className="w-full">
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading || !startupImage}
                  placeholder={isLoading ? 'thinking...' : (startupImage ? 'Ask anything...' : 'Please load an image first...')}
                  className="w-full rounded-2xl border border-neutral-800/80 bg-neutral-900/80 px-5 py-4 pr-14 text-sm text-neutral-100 outline-none transition focus:border-black-500/60 focus:ring-2 focus:ring-black-500/20 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;
