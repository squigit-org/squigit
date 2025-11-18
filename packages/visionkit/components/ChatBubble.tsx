import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types';
import { Bot, User } from 'lucide-react';

interface ChatBubbleProps {
  message: Message;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [message]);

  return (
    <div ref={messagesEndRef} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} `}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Removed profile photo circle */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div
            className={`w-full rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-md shadow-[0_40px_120px_rgba(0,0,0,0.35)] ${
              isUser
                ? 'border border-neutral-800/80 bg-neutral-900/80 text-neutral-100'
                : 'border-none bg-transparent text-neutral-300'
            }`}
          >
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>

          {message.image && (
            <div className="mt-2 w-full max-w-[220px] overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70">
              <img
                src={message.image.startsWith('data:') ? message.image : `data:image/jpeg;base64,${message.image}`}
                alt="Analyzed content"
                className="h-auto w-full object-cover"
              />
              <div className="border-t border-neutral-800/60 bg-neutral-900/80 px-3 py-2 text-center text-xs text-neutral-400">
                Analyzed image
              </div>
            </div>
          )}

          {isUser && (
            <span className="mt-2 text-xs text-neutral-500">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
