import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Match, AISettings } from '../types';
import { AIProvider } from '../types';
import { LoadingIcon, XCircleIcon, MagicIcon } from './Icons';
import { toolDeclarations } from '../services/aiService';

// Icons for expand/collapse
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const ArrowDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

interface ChatAssistantProps {
  aiSettings: AISettings;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onToolCall: (toolName: string, args: any) => Promise<{ output: any }>;
  selectedMatchIds: Set<string>;
  onClearSelection: () => void;
  allMatches: Match[];
  pendingMatchesCount: number;
  confirmedMatchesCount: number;
  unmatchedColumnsCount: number;
  lastToolUsed: string | null;
}

const suggestions = [
    "Review current column cards",
    "Match unmatched columns",
    "Auto-apply all AI suggestions",
    "Auto-Process & Match",
    "Fully-Auto: Review, Apply, Match, Repeat, and Download SQL",
];

// Conversation history type for internal state
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; args: any; id?: string }>;
  toolResults?: Array<{ toolCallId?: string; name: string; result: any }>;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  aiSettings, messages, setMessages, isLoading, setIsLoading, onToolCall,
  selectedMatchIds, onClearSelection, allMatches,
  pendingMatchesCount, confirmedMatchesCount, unmatchedColumnsCount,
  lastToolUsed
}) => {
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    // Load auto-scroll preference from localStorage
    const saved = localStorage.getItem('chatAutoScroll');
    return saved ? JSON.parse(saved) : false;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
    setHasNewMessages(false);
  };

  // Check if user has scrolled up
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);

      // If user scrolls to bottom manually, clear new messages indicator
      if (isNearBottom) {
        setHasNewMessages(false);
      }
    }
  };

  // Save auto-scroll preference to localStorage
  useEffect(() => {
    localStorage.setItem('chatAutoScroll', JSON.stringify(autoScroll));
  }, [autoScroll]);

  // Handle new messages and auto-scroll
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      // New message(s) arrived
      if (autoScroll) {
        // Only auto-scroll if explicitly enabled
        setTimeout(() => scrollToBottom(), 100);
      } else {
        // Show new messages indicator when auto-scroll is disabled
        setHasNewMessages(true);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, autoScroll]);
  
  const addMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }

  // Function to call Gemini API with function calling
  const callGeminiWithTools = async (prompt: string, history: ConversationMessage[]) => {
    const activeConfig = aiSettings.providers[AIProvider.GEMINI];
    
    // Build the conversation for Gemini
    const contents = history.map(msg => {
      if (msg.toolCalls) {
        // Message with function calls
        return {
          role: msg.role,
          parts: msg.toolCalls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.args
            }
          }))
        };
      } else if (msg.toolResults) {
        // Function response message
        return {
          role: 'function',
          parts: msg.toolResults.map(tr => ({
            functionResponse: {
              name: tr.name,
              response: tr.result
            }
          }))
        };
      } else {
        // Regular text message
        return {
          role: msg.role,
          parts: [{ text: msg.content }]
        };
      }
    });

    // Add the new user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeConfig.selectedModel}:generateContent?key=${activeConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          tools: [{
            functionDeclarations: toolDeclarations
          }]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    
    if (!candidate) {
      throw new Error('No response from Gemini API');
    }

    // Parse function calls if any
    const functionCalls = candidate.content?.parts
      ?.filter((part: any) => part.functionCall)
      .map((part: any) => ({
        name: part.functionCall.name,
        args: part.functionCall.args || {}
      })) || [];

    // Get text response if any
    const textParts = candidate.content?.parts
      ?.filter((part: any) => part.text)
      .map((part: any) => part.text) || [];
    const text = textParts.join('');

    return {
      functionCalls: functionCalls.length > 0 ? functionCalls : null,
      text: text || ''
    };
  };

  // Function to call Anthropic API with tool use
  const callAnthropicWithTools = async (prompt: string, history: ConversationMessage[]) => {
    const activeConfig = aiSettings.providers[AIProvider.ANTHROPIC];
    
    // Build the conversation for Anthropic
    const messages = [];
    
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: msg.content
        });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls) {
          // Assistant message with tool use
          messages.push({
            role: 'assistant',
            content: msg.toolCalls.map(tc => ({
              type: 'tool_use',
              id: tc.id || `tool_${Date.now()}_${Math.random()}`,
              name: tc.name,
              input: tc.args
            }))
          });
        } else {
          // Regular assistant message
          messages.push({
            role: 'assistant',
            content: msg.content
          });
        }
      }
      
      // Add tool results if present
      if (msg.toolResults) {
        messages.push({
          role: 'user',
          content: msg.toolResults.map(tr => ({
            type: 'tool_result',
            tool_use_id: tr.toolCallId,
            content: JSON.stringify(tr.result)
          }))
        });
      }
    }

    // Add the new user prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    // Convert tool declarations to Anthropic format
    const tools = toolDeclarations.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters?.properties || {},
        required: tool.parameters?.required || []
      }
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': activeConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: activeConfig.selectedModel,
        max_tokens: 4096,
        messages,
        tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Parse tool use blocks
    const toolUseBlocks = data.content?.filter((block: any) => block.type === 'tool_use') || [];
    const toolCalls = toolUseBlocks.map((block: any) => ({
      id: block.id,
      name: block.name,
      args: block.input
    }));

    // Get text response
    const textBlocks = data.content?.filter((block: any) => block.type === 'text') || [];
    const text = textBlocks.map((block: any) => block.text).join('');

    return {
      functionCalls: toolCalls.length > 0 ? toolCalls : null,
      text: text || ''
    };
  };

  const handleSend = async (e: React.FormEvent, messageContent?: string) => {
    e.preventDefault();
    const prompt = messageContent || input;
    if (!prompt.trim() || isLoading) return;

    // Validate AI settings
    const activeConfig = aiSettings.providers[aiSettings.activeProvider];
    if (!activeConfig.apiKey || !activeConfig.selectedModel) {
      addMessage({ 
        role: 'assistant', 
        content: `Please configure your ${aiSettings.activeProvider} API key and select a model in the AI Settings.` 
      });
      return;
    }

    addMessage({ role: 'user', content: prompt });
    setInput('');
    setIsLoading(true);

    try {
        // Add context of selected matches if any
        let finalPrompt = prompt;
        if (selectedMatchIds.size > 0) {
            const selectedMatches = allMatches.filter(m => selectedMatchIds.has(m.id));
            const context = `The user has highlighted the following matches:\n` +
                selectedMatches.map(m => `- ${m.finalName}: [${Array.isArray(m.columns) ? m.columns.map(c => c.columnName).join(', ') : ''}]`).join('\n');
            finalPrompt = `${context}\n\nUser's question: ${prompt}`;
        }
        
        let isFinished = false;
        let currentHistory = [...conversationHistory];
        
        // Add the user message to history
        currentHistory.push({ role: 'user', content: finalPrompt });

        while (!isFinished) {
            let response;
            
            // Call appropriate provider
            if (aiSettings.activeProvider === AIProvider.GEMINI) {
                response = await callGeminiWithTools(finalPrompt, currentHistory.slice(0, -1));
            } else if (aiSettings.activeProvider === AIProvider.ANTHROPIC) {
                response = await callAnthropicWithTools(finalPrompt, currentHistory.slice(0, -1));
            } else {
                throw new Error(`Unsupported provider: ${aiSettings.activeProvider}`);
            }

            if (response.functionCalls) {
                // Handle function/tool calls
                const toolResults = [];
                const assistantMsg: ConversationMessage = {
                    role: 'assistant',
                    content: '',
                    toolCalls: response.functionCalls
                };
                currentHistory.push(assistantMsg);

                for (const toolCall of response.functionCalls) {
                    addMessage({ role: 'assistant', content: `Running command: \`${toolCall.name}\`...` });
                    const toolResult = await onToolCall(toolCall.name, toolCall.args);
                    toolResults.push({ 
                        toolCallId: toolCall.id,
                        name: toolCall.name, 
                        result: toolResult 
                    });
                }

                // Add tool results to history
                currentHistory.push({
                    role: 'assistant',
                    content: '',
                    toolResults
                });

                // Continue the loop with tool results
                finalPrompt = ''; // Empty prompt for continuation
            } else {
                // Final text response
                addMessage({ role: 'assistant', content: response.text });
                currentHistory.push({ 
                    role: 'assistant', 
                    content: response.text 
                });
                isFinished = true;
            }
        }

        // Update conversation history
        setConversationHistory(currentHistory);

    } catch (error) {
      console.error("Chat error:", error);
      addMessage({ 
        role: 'assistant', 
        content: error instanceof Error 
          ? `Error: ${error.message}` 
          : "Sorry, I ran into an issue. Please try again." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border rounded-lg shadow-lg">
      <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex justify-between items-center">
            <div className="flex-grow min-w-0">
                <h3 className="font-semibold text-lg text-gray-800 truncate">Chat with Chloe</h3>
                {!isMinimized && <p className="text-sm text-gray-500">Your AI Data Assistant</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {!isMinimized && (
                  <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-gray-200" title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}>
                    <span className="text-xs text-gray-600 font-medium">Auto-scroll</span>
                    <button
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${autoScroll ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                )}
                {selectedMatchIds.size > 0 && !isMinimized && (
                    <button onClick={onClearSelection} className="flex items-center text-xs bg-gray-200 text-gray-700 font-semibold py-1 px-2 rounded-md hover:bg-gray-300">
                        <XCircleIcon className="w-4 h-4 mr-1"/>
                        Clear ({selectedMatchIds.size})
                    </button>
                )}
                <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                    title={isMinimized ? "Expand chat" : "Minimize chat"}
                >
                    {isMinimized ? <ChevronUpIcon className="w-5 h-5 text-gray-600" /> : <ChevronDownIcon className="w-5 h-5 text-gray-600" />}
                </button>
            </div>
        </div>
        {lastToolUsed && !isMinimized && (
            <div className="mt-3 p-2 bg-indigo-50 border border-indigo-200 rounded-md text-center">
                <p className="text-xs text-indigo-800 font-semibold flex items-center justify-center">
                    <MagicIcon className="w-4 h-4 mr-2 text-indigo-600"/>
                    Chloe used the tool: <span className="font-bold ml-1 font-mono">{lastToolUsed}</span>
                </p>
            </div>
        )}
         {!isMinimized && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-blue-50 rounded-md">
                    <div className="font-bold text-blue-700 text-lg">{pendingMatchesCount}</div>
                    <div className="text-blue-600 font-semibold">PENDING</div>
                </div>
                <div className="p-2 bg-green-50 rounded-md">
                    <div className="font-bold text-green-700 text-lg">{confirmedMatchesCount}</div>
                    <div className="text-green-600 font-semibold">CONFIRMED</div>
                </div>
                <div className="p-2 bg-gray-100 rounded-md">
                    <div className="font-bold text-gray-700 text-lg">{unmatchedColumnsCount}</div>
                    <div className="text-gray-600 font-semibold">UNMATCHED</div>
                </div>
            </div>
        )}
      </div>

      {!isMinimized && (
        <>
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-grow p-4 overflow-y-auto bg-gray-50 relative"
          >
            <div className="space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] sm:max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 border border-gray-200'}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                   <div className="flex items-center space-x-2 max-w-xs px-4 py-2 rounded-lg bg-white text-gray-800 border border-gray-200 shadow-sm">
                    <LoadingIcon className="w-5 h-5" />
                    <p className="text-sm italic">Working...</p>
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* New messages indicator */}
            {hasNewMessages && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all z-10 flex items-center gap-2 animate-bounce"
                title="Scroll to new messages"
              >
                <span className="text-sm font-semibold">New messages</span>
                <ArrowDownIcon className="w-4 h-4" />
              </button>
            )}

            {/* Scroll to bottom button */}
            {showScrollButton && !hasNewMessages && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 right-4 p-3 bg-gray-600 text-white rounded-full shadow-lg hover:bg-gray-700 transition-all z-10"
                title="Scroll to latest message"
              >
                <ArrowDownIcon className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="p-3 border-t bg-white">
            <div className="flex flex-wrap gap-2 mb-2">
                {suggestions.map(s => (
                    <button key={s} onClick={(e) => handleSend(e, s)} disabled={isLoading} className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full hover:bg-blue-200 disabled:opacity-50 transition-colors">
                        {s}
                    </button>
                ))}
            </div>
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-grow px-4 py-2 text-sm border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !input.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                Send
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};