import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Match, AISettings } from '../types';
import { AIProvider } from '../types';
import { LoadingIcon, XCircleIcon, MagicIcon } from './Icons';
import { toolDeclarations } from '../services/aiService';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, isLoading]);
  
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
    <div className="flex flex-col h-full bg-white border rounded-lg shadow">
      <div className="p-3 border-b">
        <div className="flex justify-between items-center">
            <div>
                <h3 className="font-semibold text-lg text-gray-800">Chat with Chloe</h3>
                <p className="text-sm text-gray-500">Your AI Data Assistant</p>
            </div>
            {selectedMatchIds.size > 0 && (
                <button onClick={onClearSelection} className="flex items-center text-xs bg-gray-200 text-gray-700 font-semibold py-1 px-2 rounded-md hover:bg-gray-300">
                    <XCircleIcon className="w-4 h-4 mr-1"/>
                    Clear ({selectedMatchIds.size})
                </button>
            )}
        </div>
        {lastToolUsed && (
            <div className="mt-3 p-2 bg-indigo-50 border border-indigo-200 rounded-md text-center">
                <p className="text-xs text-indigo-800 font-semibold flex items-center justify-center">
                    <MagicIcon className="w-4 h-4 mr-2 text-indigo-600"/>
                    Chloe used the tool: <span className="font-bold ml-1 font-mono">{lastToolUsed}</span>
                </p>
            </div>
        )}
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
      </div>
      <div className="flex-grow p-4 overflow-y-auto bg-gray-50">
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="flex items-center space-x-2 max-w-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-800">
                <LoadingIcon className="w-5 h-5" />
                <p className="text-sm italic">Working...</p>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-3 border-t bg-white">
        <div className="flex flex-wrap gap-2 mb-2">
            {suggestions.map(s => (
                <button key={s} onClick={(e) => handleSend(e, s)} disabled={isLoading} className="text-xs font-medium bg-blue-100 text-blue-800 px-3 py-1 rounded-full hover:bg-blue-200 disabled:opacity-50">
                    {s}
                </button>
            ))}
        </div>
        <form onSubmit={handleSend} className="flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message or select a suggestion..."
            className="flex-grow px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="ml-3 px-5 py-2 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 disabled:bg-gray-400">
            Send
          </button>
        </form>
      </div>
    </div>
  );
};