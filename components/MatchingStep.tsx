import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Match, UploadedFile, ColumnInMatch, ChatMessage, AIReview, ColumnData, AISettings } from '../types';
import { MatchStatus, MatchSource, AIRecommendedAction, AIProvider } from '../types';
import { CheckCircleIcon, XCircleIcon, MagicIcon, EditIcon, LoadingIcon, TableIcon, LightbulbIcon, EyeIcon, TrashIcon, LinkIcon, QuestionMarkCircleIcon, DocumentTextIcon, DownloadIcon } from './Icons';
import { suggestMatchesForUnmatchedColumns, reviewAllPendingMatches, getCompletenessScore, generateColumnProfile } from '../services/aiService';
import { compareColumnContents } from '../services/matchingService';
import { ChatAssistant } from './ChatAssistant';
import { DataPreviewModal } from './DataPreviewModal';
import { ExportControl } from './ExportControl';
import { AISettingsControl } from './AISettingsControl';
import { v4 as uuidv4 } from 'uuid';
import { SourceFilesControl } from './SourceFilesControl';

// --- User Guide Modal Component ---

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuideSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-3 border-b pb-2">{title}</h3>
        <div className="space-y-4 text-gray-700">{children}</div>
    </div>
);

const GuideItem: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-blue-600 mr-4 mt-1">
            {icon}
        </div>
        <div>
            <h4 className="font-semibold text-gray-800">{title}</h4>
            <p className="text-sm">{children}</p>
        </div>
    </div>
);

const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-800">User Guide & Pro Tips</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <XCircleIcon className="w-8 h-8" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
            <GuideSection title="Interacting with Match Cards">
                <GuideItem icon={<div className="w-6 h-6 rounded border-2 border-purple-500 bg-purple-100" />} title="Focus the AI">
                    Click on a card (or multiple) to highlight them in purple. Chloe, your AI assistant, will then focus on these specific selections in the chat, allowing you to ask targeted questions.
                </GuideItem>
                 <GuideItem icon={<EditIcon className="w-6 h-6" />} title="Rename a Match">
                    Click the <EditIcon className="w-4 h-4 inline-block -mt-1" /> icon to give the final unioned column a new, more descriptive name.
                </GuideItem>
                <GuideItem icon={<EyeIcon className="w-6 h-6" />} title="Preview Data">
                    Click the <EyeIcon className="w-4 h-4 inline-block -mt-1" /> icon on a card header to compare the sample data from all its columns side-by-side. This is great for verifying a match.
                </GuideItem>
                 <GuideItem icon={<TrashIcon className="w-6 h-6" />} title="Crumble a Match">
                    Click the <TrashIcon className="w-4 h-4 inline-block -mt-1" /> icon to 'crumble' an entire match. All its columns will be released and returned to the 'Manual Matching' panel.
                </GuideItem>
            </GuideSection>
            
            <GuideSection title="Managing Individual Columns">
                <GuideItem icon={<XCircleIcon className="w-6 h-6" />} title="Remove a Column">
                     Click the <XCircleIcon className="w-4 h-4 inline-block -mt-1" /> icon next to a specific column inside a card to remove just that one from the match. It will return to the unmatched pool.
                </GuideItem>
                <GuideItem icon={<EyeIcon className="w-6 h-6" />} title="Preview a Single Column">
                    Click the <EyeIcon className="w-4 h-4 inline-block -mt-1" /> icon next to any column name to see a quick preview of its individual data.
                </GuideItem>
                <GuideItem icon={<div className="w-6 h-6 rounded-full bg-blue-300" />} title="Source Colors">
                    Each column has a color bar on the left indicating its source file. Customize these colors in the 'Source Files' panel to easily track data origins.
                </GuideItem>
            </GuideSection>

            <GuideSection title="Creating Matches Manually">
                 <GuideItem icon={<LinkIcon className="w-6 h-6" />} title="Find, Select & Create">
                    Use the search bar in the 'Manual Matching' panel to find columns by name or even by their content. Check the boxes next to two or more columns, give the match a name, and click 'Create Match' to make a new card.
                </GuideItem>
            </GuideSection>

            <GuideSection title="Exporting Your Results">
                <GuideItem icon={<DownloadIcon className="w-6 h-6" />} title="SQL File">
                    Generates a ready-to-use Snowflake SQL script. Use this file to perform the final data union in your data warehouse.
                </GuideItem>
                <GuideItem icon={<DownloadIcon className="w-6 h-6" />} title="JSON File">
                    Saves a complete snapshot of your current matching state. It's perfect for auditing your work or for pausing and resuming a large project later.
                </GuideItem>
                 <GuideItem icon={<DocumentTextIcon className="w-6 h-6" />} title="HTML Report">
                    Creates a user-friendly, visual report of the entire union plan. This is ideal for sharing with team members or for documentation purposes.
                </GuideItem>
            </GuideSection>
        </div>

        <div className="p-4 border-t bg-gray-50 text-right">
            <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Got it!
            </button>
        </div>
      </div>
    </div>
  );
};


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ManualMatchPanelProps {
    unmatchedColumns: Map<string, string[]>;
    files: UploadedFile[];
    onPreview: (columns: ColumnData[]) => void;
    onCreateMatch: (finalName: string) => void;
    selectedUnmatched: Set<string>;
    onToggleSelect: (columnKey: string) => void;
    onClearSelection: () => void;
}

const ManualMatchPanel: React.FC<ManualMatchPanelProps> = ({
    unmatchedColumns, files, onPreview, onCreateMatch,
    selectedUnmatched, onToggleSelect, onClearSelection
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    
    const fileMap = useMemo(() => new Map(files.map(f => [f.name, f])), [files]);
    const allColumns = useMemo(() => files.flatMap(f => f.columns), [files]);

    const filteredUnmatched = useMemo(() => {
        if (!searchQuery.trim()) {
            return unmatchedColumns;
        }
        const lowerCaseQuery = searchQuery.toLowerCase();
        const newFiltered = new Map<string, string[]>();

        unmatchedColumns.forEach((cols, fileName) => {
            const matchingCols = cols.filter(colName => {
                if (colName.toLowerCase().includes(lowerCaseQuery)) {
                    return true;
                }
                const colData = allColumns.find(c => c.fileName === fileName && c.originalName === colName);
                if (colData) {
                    // Search in sample data
                    return colData.sampleData.some(d => String(d).toLowerCase().includes(lowerCaseQuery));
                }
                return false;
            });
            if (matchingCols.length > 0) {
                newFiltered.set(fileName, matchingCols);
            }
        });
        return newFiltered;
    }, [searchQuery, unmatchedColumns, allColumns]);
    
    const handleCreateClick = () => {
        const finalName = window.prompt("Enter a name for the new unioned column:");
        if (finalName && finalName.trim()) {
            onCreateMatch(finalName.trim());
        }
    };
    
    return (
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border flex flex-col" style={{height: 'clamp(20rem, 40rem, 50vh)'}}>
            <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Manual Matching</h3>
            <div className="mb-3 md:mb-4">
                <input
                    type="text"
                    placeholder="Search by name or content..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 text-xs md:text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div className="flex-grow overflow-y-auto space-y-2 md:space-y-3 pr-1 md:pr-2">
                {Array.from(filteredUnmatched.entries()).map(([fileName, columns]) => {
                     const file = fileMap.get(fileName);
                     if (!file) return null;
                     return (
                    <div key={fileName}>
                        <h4 className="font-semibold text-sm md:text-base text-gray-700 mb-1">{fileName}</h4>
                        <ul className="space-y-1">
                            {columns.map(colName => {
                                const colData = allColumns.find(c => c.fileName === fileName && c.originalName === colName);
                                const key = `${fileName}::${colName}`;
                                const isSelected = selectedUnmatched.has(key);
                                return (
                                    <li key={key}
                                        onClick={() => onToggleSelect(key)}
                                        style={{ borderLeft: `4px solid ${file.color}` }}
                                        className={`flex justify-between items-center p-1.5 md:p-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                                    >
                                        <div className="flex items-center truncate min-w-0 flex-grow">
                                            <input type="checkbox" checked={isSelected} readOnly className="h-3.5 w-3.5 md:h-4 md:w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2 md:mr-3 flex-shrink-0" />
                                            <span className="font-bold text-gray-500 text-xs mr-1 md:mr-2 flex-shrink-0">[{file.sourceId}]</span>
                                            <span className="text-xs md:text-sm text-gray-800 truncate" title={colName}>{colName}</span>
                                        </div>
                                        {colData && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPreview([colData]); }}
                                                className="ml-2 text-gray-400 hover:text-blue-500 flex-shrink-0 p-0.5"
                                                title={`Preview data for ${colName}`}
                                            >
                                                <EyeIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )})}
                {filteredUnmatched.size === 0 && <p className="text-xs md:text-sm text-gray-500 text-center py-4">No matching columns found.</p>}
            </div>
             <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t flex items-center gap-2 md:gap-3">
                 <button
                    onClick={handleCreateClick}
                    disabled={selectedUnmatched.size < 2}
                    className="w-full flex items-center justify-center py-2 px-3 md:px-4 text-xs md:text-sm bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    <LinkIcon className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2" />
                    Create Match ({selectedUnmatched.size})
                </button>
                 <button
                     onClick={onClearSelection}
                     disabled={selectedUnmatched.size === 0}
                     className="text-gray-600 hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed flex-shrink-0"
                     title="Clear selection"
                 >
                     <XCircleIcon className="w-6 h-6 md:w-7 md:h-7" />
                 </button>
            </div>
        </div>
    );
};

interface MatchingStepProps {
  initialMatches: Match[];
  unmatchedColumns: Map<string, string[]>;
  files: UploadedFile[];
  onProceed: (finalMatches: Match[]) => void;
}

export const MatchingStep: React.FC<MatchingStepProps> = ({ initialMatches, unmatchedColumns: initialUnmatched, files: initialFiles, onProceed }) => {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [unmatchedColumns, setUnmatchedColumns] = useState<Map<string, string[]>>(initialUnmatched);
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // AI Settings State
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('aiSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Error parsing saved AI settings:', error);
      }
    }
    
    // Default settings
    return {
      providers: {
        [AIProvider.GEMINI]: {
          provider: AIProvider.GEMINI,
          apiKey: '',
          selectedModel: '',
          availableModels: []
        },
        [AIProvider.ANTHROPIC]: {
          provider: AIProvider.ANTHROPIC,
          apiKey: '',
          selectedModel: '',
          availableModels: []
        }
      },
      activeProvider: AIProvider.GEMINI,
      apiCallDelay: 1,
      maxRetries: 3
    };
  });

  // Save AI settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('aiSettings', JSON.stringify(aiSettings));
  }, [aiSettings]);

  // Data Preview Modal State
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [columnsToPreview, setColumnsToPreview] = useState<ColumnData[]>([]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);
  const [isFullyAutonomous, setIsFullyAutonomous] = useState(false);
  const [lastToolUsed, setLastToolUsed] = useState<string | null>(null);

  // Manual Matching State
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set());

  // User Guide Modal State
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // A ref to ensure we have the latest state within the autonomous loop
  const latestStateRef = useRef({ matches, unmatchedColumns, files });
  useEffect(() => {
    latestStateRef.current = { matches, unmatchedColumns, files };
  }, [matches, unmatchedColumns, files]);

  const handleColorChange = (fileId: string, color: string) => {
    setFiles(prevFiles => prevFiles.map(f => f.id === fileId ? {...f, color} : f));
  };
  
  const addAssistantMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  };

  const pendingMatches = useMemo(() => matches.filter(m => m.status === MatchStatus.PENDING), [matches]);
  const confirmedMatches = useMemo(() => matches.filter(m => m.status === MatchStatus.CONFIRMED), [matches]);
  
  const fileMap = useMemo(() => new Map(files.map(f => [f.id, f])), [files]);
  const allColumns = useMemo(() => files.flatMap(f => f.columns), [files]);

  const getSystemInstruction = useCallback(() => {
     const allUnmatchedCols: string[] = [];
    unmatchedColumns.forEach((cols, fileName) => {
        allUnmatchedCols.push(`  ${fileName}: ${cols.join(', ')}`);
    });

    return `You are Chloe, an intelligent data union assistant. Your primary function is to help users combine data tables by calling tools. You MUST strictly follow these rules:
1.  **Prioritize Tools Over Text**: When a user's request can be fulfilled by a tool, you MUST call that tool. Do NOT answer with a text description of what the tool would do. Your purpose is to execute actions, not to chat.
2.  **Tool Mapping**:
    - If the user asks to "review", "analyze", or "check" the current matches, you MUST call the \`review_all_matches\` tool. This adds recommendations to the cards.
    - If the user asks to "find new matches", "look for more", or "match unmatched", you MUST call the \`find_new_matches\` tool.
    - If the user asks to "apply suggestions", "confirm reviews", or "accept changes", you MUST call the \`apply_all_suggestions\` tool.
    - If the user asks you to "do everything", "run autonomously", "finish it for me", or "Auto-Process & Match", you MUST call the \`start_autonomous_mode\` tool.
    - If the user mentions doing everything and also downloading or generating an SQL file, you MUST call the \`start_fully_autonomous_mode\` tool.
    - To get a deep analysis of a specific column to verify a match, you MUST call \`get_column_details\` with the \`fileName\` and \`columnName\`.
    - To perform a direct content comparison between two columns when you are unsure, you MUST call \`search_column_content\` with the source and target file/column names.
3.  **Investigate When Unsure**: If you are uncertain whether two columns are a good match (e.g., their names are ambiguous like "Amount" or "Points"), you MUST use the \`search_column_content\` tool on the two columns. Compare their content similarity score and summary before making a final decision. This is crucial for accuracy. Do not guess.
4.  **User Context is Key**: The user sees the matches and unmatched columns on their screen. Do not repeat this information. Use the context below only to inform your tool calls. After a tool returns, you can give a very brief confirmation (e.g., "Done. I've reviewed 5 matches and added my recommendations to the cards.").
5.  **User Has Powerful Preview Tools**: Users can click the eye icon on match cards to open an interactive data preview modal. In this modal, they can:
    - Click any cell value to search for that exact value across all columns in the match (shows match counts for each column)
    - Use search boxes at the top of each column to filter rows
    - See highlighted cells that match their search criteria
    This means users can independently verify match quality by checking if columns contain similar data. When users mention seeing data in the preview or ask about specific values, acknowledge that they're using these powerful verification tools.

CURRENT STATE FOR YOUR CONTEXT:
- Files being processed:
${files.map(f => `  - [Source ${f.sourceId}] ${f.name} (${f.rowCount} rows)`).join('\n')}
- Current matches (${matches.length}):
${matches.map(m => `  - ${m.finalName} (${m.status}): [${(Array.isArray(m.columns) ? m.columns : []).map(c => `${c.fileName}.${c.columnName}`).join(', ')}]`).join('\n')}
- Unmatched columns:
${allUnmatchedCols.length > 0 ? allUnmatchedCols.join('\n') : '  None'}

Your only job is to translate user requests into tool calls. Be direct and efficient.`;
  }, [files, matches, unmatchedColumns]);
  
  useEffect(() => {
    setMessages([{ role: 'assistant', content: "Hi! I'm Chloe. How can I help you with your data?" }]);
  }, []); // Run only once

  const updateUnmatchedAfterAction = (newlyMatchedColumns: ColumnInMatch[]) => {
      const newlyMatched = new Set<string>(newlyMatchedColumns.map(c => `${c.fileName}::${c.columnName}`));
      setUnmatchedColumns(prev => {
          const newUnmatched = new Map<string, string[]>();
          prev.forEach((cols, file) => {
              const remaining = cols.filter(c => !newlyMatched.has(`${file}::${c}`));
              if (remaining.length > 0) {
                  newUnmatched.set(file, remaining);
              }
          });
          return newUnmatched;
      });
  };

  const applyAIReviewsToState = (reviews: (AIReview & {matchId: string})[]) => {
      let releasedColumns: ColumnInMatch[] = [];
      let changesCount = 0;

      const updatedMatches = latestStateRef.current.matches.map(m => {
          const review = reviews.find(r => r.matchId === m.id);
          if (!review) return m;

          changesCount++;
          const { aiReview, columns, ...restOfMatch } = m;
          
          switch(review.action) {
              case AIRecommendedAction.DENY:
                  if (Array.isArray(columns)) {
                      releasedColumns.push(...columns);
                  }
                  return null;
              case AIRecommendedAction.MODIFY:
                  if (review.suggestedColumns && Array.isArray(review.suggestedColumns) && review.suggestedColumns.length > 0) {
                      const correctColsSet = new Set(review.suggestedColumns.map(c => `${c.fileName}::${c.columnName}`));
                      const sourceColumns = columns;
                      if (Array.isArray(sourceColumns)) {
                          const incorrectCols = sourceColumns.filter(c => !correctColsSet.has(`${c.fileName}::${c.columnName}`));
                          releasedColumns.push(...incorrectCols);
                      }
                      return { ...restOfMatch, columns: review.suggestedColumns, status: MatchStatus.CONFIRMED, source: MatchSource.AI };
                  }
                  return m; // Return original match if modify is malformed
              case AIRecommendedAction.CONFIRM:
                   return { ...restOfMatch, columns, status: MatchStatus.CONFIRMED };
              default:
                   return m;
          }
      }).filter((m): m is Match => m !== null);

      setMatches(updatedMatches);
      
      if (releasedColumns.length > 0) {
        const allReleasedColsMap = new Map<string, string[]>();
        releasedColumns.forEach(c => {
            if (!allReleasedColsMap.has(c.fileName)) allReleasedColsMap.set(c.fileName, []);
            allReleasedColsMap.get(c.fileName)!.push(c.columnName);
        });
        setUnmatchedColumns(prev => {
            const newUnmatched = new Map(prev);
            allReleasedColsMap.forEach((cols, file) => {
                const existing = newUnmatched.get(file) || [];
                const existingArray = Array.isArray(existing) ? existing : [];
                newUnmatched.set(file, [...new Set([...existingArray, ...cols])]);
            });
            return newUnmatched;
        });
      }
      return changesCount;
  };
  
  const handleApplySuggestion = (matchId: string) => {
    const currentMatches = latestStateRef.current.matches;
    const matchToUpdate = currentMatches.find(m => m.id === matchId);

    if (!matchToUpdate || !matchToUpdate.aiReview) return;

    let releasedColumns: ColumnInMatch[] = [];
    const review = matchToUpdate.aiReview;

    const updatedMatches = currentMatches.map(m => {
        if (m.id !== matchId) return m;

        const { aiReview, columns, ...rest } = m; // Always remove the review after action

        switch (review.action) {
            case AIRecommendedAction.DENY:
                if (Array.isArray(columns)) {
                    releasedColumns.push(...columns);
                }
                return null;
            case AIRecommendedAction.MODIFY:
                if (review.suggestedColumns && Array.isArray(review.suggestedColumns) && review.suggestedColumns.length > 0) {
                    const correctColsSet = new Set(review.suggestedColumns.map(c => `${c.fileName}::${c.columnName}`));
                    const sourceColumns = columns;
                    if (Array.isArray(sourceColumns)) {
                        const incorrectCols = sourceColumns.filter(c => !correctColsSet.has(`${c.fileName}::${c.columnName}`));
                        releasedColumns.push(...incorrectCols);
                    }
                    return { ...rest, columns: review.suggestedColumns, source: MatchSource.AI, status: MatchStatus.PENDING };
                }
                return m; // Revert to original match if modify is malformed
            case AIRecommendedAction.CONFIRM:
                return { ...rest, columns, status: MatchStatus.CONFIRMED };
            default:
                return m; // Revert
        }
    }).filter((m): m is Match => m !== null);

    // Set the new state for matches
    setMatches(updatedMatches);

    // If any columns were released, update the unmatched columns state
    if (releasedColumns.length > 0) {
        const releasedMap = new Map<string, string[]>();
        releasedColumns.forEach(c => {
            if (!releasedMap.has(c.fileName)) releasedMap.set(c.fileName, []);
            releasedMap.get(c.fileName)!.push(c.columnName);
        });
        setUnmatchedColumns(currentUnmatched => {
            const newUnmatched = new Map(currentUnmatched);
            releasedMap.forEach((cols, file) => {
                const existing = newUnmatched.get(file) || [];
                const existingArray = Array.isArray(existing) ? existing : [];
                newUnmatched.set(file, [...new Set([...existingArray, ...cols])]);
            });
            return newUnmatched;
        });
    }
};

  const handleDismissSuggestion = (matchId: string) => {
    setMatches(prev => prev.map(m => {
        if (m.id === matchId) {
            const { aiReview, ...rest } = m;
            return rest;
        }
        return m;
    }));
  };

  const handleToolCall = async (toolName: string, args: any): Promise<{ output: any }> => {
      setLastToolUsed(toolName);
      const response = await (async () => {
        switch(toolName) {
            case 'review_all_matches': {
                const pending = matches.filter(m => m.status === MatchStatus.PENDING && !m.aiReview);
                if (pending.length === 0) return { output: "No pending matches to review." };
                const reviews = await reviewAllPendingMatches(aiSettings, pending, files);
                if (Array.isArray(reviews)) {
                  setMatches(prev => prev.map(m => {
                      const review = reviews.find(r => r.matchId === m.id);
                      return review ? { ...m, aiReview: review } : m;
                  }));
                  return { output: `Reviewed ${reviews.length} matches. Check the cards for my analysis.` };
                }
                return { output: 'AI review failed to return valid data.' };
            }
            case 'find_new_matches': {
                const newSuggestions = await suggestMatchesForUnmatchedColumns(aiSettings, unmatchedColumns, files, matches);
                if (Array.isArray(newSuggestions) && newSuggestions.length > 0) {
                    setMatches(prev => [...newSuggestions, ...prev]);
                    updateUnmatchedAfterAction(newSuggestions.flatMap(m => (Array.isArray(m.columns) ? m.columns : [])));
                    return { output: `I found ${newSuggestions.length} new potential matches for you to review.` };
                }
                return { output: "I couldn't find any new high-confidence matches among the remaining columns." };
            }
            case 'apply_all_suggestions': {
                const matchesToReview = matches.filter(m => m.aiReview);
                if (matchesToReview.length === 0) return { output: "There are no AI suggestions to apply. Try running a review first."};
                const changes = applyAIReviewsToState(matchesToReview.map(m => ({...m.aiReview!, matchId: m.id})));
                return { output: `Applied AI suggestions, resulting in ${changes} changes.` };
            }
            case 'start_autonomous_mode': {
                setIsAutonomousMode(true);
                return { output: "Starting auto-processing mode. I'll review, match, and repeat until I'm confident the work is done. I'll keep you updated here!" };
            }
            case 'start_fully_autonomous_mode': {
                setIsFullyAutonomous(true);
                setIsAutonomousMode(true);
                return { output: "Starting fully autonomous mode. I will process everything and then prepare your SQL file for download." };
            }
            case 'get_column_details': {
                const { fileName, columnName } = args;
                if (!fileName || !columnName) {
                    return { output: "Error: `fileName` and `columnName` are required." };
                }
                const columnData = files.flatMap(f => f.columns).find(c => c.fileName === fileName && c.originalName === columnName);
                if (!columnData) {
                    return { output: `Error: Column "${columnName}" not found in file "${fileName}".` };
                }
                const profile = generateColumnProfile(columnData);
                return { output: JSON.stringify(profile, null, 2) };
            }
            case 'search_column_content': {
                const { sourceFileName, sourceColumnName, targetFileName, targetColumnName } = args;
                if (!sourceFileName || !sourceColumnName || !targetFileName || !targetColumnName) {
                    return { output: "Error: `sourceFileName`, `sourceColumnName`, `targetFileName`, and `targetColumnName` are all required." };
                }
                const allCols = files.flatMap(f => f.columns);
                const columnA = allCols.find(c => c.fileName === sourceFileName && c.originalName === sourceColumnName);
                const columnB = allCols.find(c => c.fileName === targetFileName && c.originalName === targetColumnName);

                if (!columnA || !columnB) {
                    let errorMsg = "Error: Could not find one or more columns.";
                    if (!columnA) errorMsg += ` Column "${sourceColumnName}" in file "${sourceFileName}" not found.`;
                    if (!columnB) errorMsg += ` Column "${targetColumnName}" in file "${targetFileName}" not found.`;
                    return { output: errorMsg };
                }

                const result = compareColumnContents(columnA, columnB);
                const output = `Content search result for "${sourceColumnName}" vs "${targetColumnName}":\n- Confidence Score: ${Math.round(result.score * 100)}%\n- Summary: ${result.summary}`;
                return { output: JSON.stringify({ analysis: output, details: result.details }) };
            }
            default:
                return { output: "Sorry, I don't know how to do that." };
        }
      })();
      return response;
  };

  useEffect(() => {
    const runAutonomousLoop = async () => {
        const REVIEW_BATCH_SIZE = 8;
        let loopCount = 0;
        let shouldContinue = true;
        let consecutiveFailures = 0;

        const makeApiCallWithRetries = async <T,>(
            apiFunction: (...args: any[]) => Promise<T>, 
            args: any[], 
            callDescription: string
        ): Promise<T | null> => {
            let attempts = 0;
            while (true) {
                try {
                    const result = await apiFunction(...args);
                    if (consecutiveFailures > 0) {
                       addAssistantMessage(`API call successful. Resetting delay to ${aiSettings.apiCallDelay} seconds.`);
                   }
                    consecutiveFailures = 0; // Reset on success
                    return result;
                } catch (error) {
                    consecutiveFailures++;
                    attempts++;
                    console.error(`Error during autonomous ${callDescription}:`, error);

                    if (aiSettings.maxRetries > 0 && attempts >= aiSettings.maxRetries) {
                        addAssistantMessage(`Maximum number of retries (${aiSettings.maxRetries}) reached. Pausing autonomous mode.`);
                        throw new Error("Max retries reached");
                    }
                    
                    let currentDelaySeconds = aiSettings.apiCallDelay;
                    if (consecutiveFailures >= 5) {
                        currentDelaySeconds = 300;
                    } else if (consecutiveFailures >= 2) {
                        currentDelaySeconds = 60;
                    }
                    
                    addAssistantMessage(`An API error occurred during "${callDescription}". Retrying in ${currentDelaySeconds} seconds... (Attempt ${attempts})`);
                    await delay(currentDelaySeconds * 1000);
                }
            }
        };

        while (loopCount < 10 && shouldContinue) {
            loopCount++;
            addAssistantMessage(`--- Starting Autonomous Loop ${loopCount} ---`);
            let changesMadeThisCycle = false;

            try {
                // --- PHASE 1: Clear the entire pending queue ---
                let reviewPass = 0;
                while (true) {
                    const pendingForReview = latestStateRef.current.matches.filter(m => m.status === MatchStatus.PENDING);
                    
                    if (pendingForReview.length === 0) {
                        if (reviewPass > 1) addAssistantMessage("Pending queue is clear.");
                        break; // Exit phase 1
                    }
                    if (reviewPass > 5) { 
                        addAssistantMessage("Stuck reviewing matches. Moving on to find new ones.");
                        break;
                    }
                    
                    reviewPass++;
                    addAssistantMessage(`[Loop ${loopCount}.${reviewPass}] Found ${pendingForReview.length} pending matches. Reviewing in batches...`);
                    let reviewsThisPass: (AIReview & {matchId: string})[] = [];

                    for (let i = 0; i < pendingForReview.length; i += REVIEW_BATCH_SIZE) {
                        const batch = pendingForReview.slice(i, i + REVIEW_BATCH_SIZE);
                        addAssistantMessage(`- Reviewing batch ${Math.floor(i / REVIEW_BATCH_SIZE) + 1} (${batch.length} matches)...`);
                        setLastToolUsed('review_all_matches');
                        const batchReviews = await makeApiCallWithRetries(reviewAllPendingMatches, [aiSettings, batch, latestStateRef.current.files], `Review Batch ${i / REVIEW_BATCH_SIZE + 1}`);
                        
                        if (Array.isArray(batchReviews) && batchReviews.length > 0) {
                            reviewsThisPass.push(...batchReviews);
                        }
                        await delay(aiSettings.apiCallDelay * 1000);
                    }

                    if (reviewsThisPass.length > 0) {
                        addAssistantMessage(`[Loop ${loopCount}.${reviewPass}] Applying ${reviewsThisPass.length} new reviews...`);
                        setLastToolUsed('apply_all_suggestions');
                        const reviewChanges = applyAIReviewsToState(reviewsThisPass);
                        if (reviewChanges > 0) {
                            changesMadeThisCycle = true;
                        }
                    } else {
                        addAssistantMessage(`[Loop ${loopCount}.${reviewPass}] No new actionable reviews were generated. Moving on.`);
                        break; // No progress, exit phase 1
                    }
                }

                // --- PHASE 2: Find new matches if pending is clear ---
                let newMatchesFound = false;
                if (latestStateRef.current.unmatchedColumns.size > 0) {
                    const unmatchedCount = Array.from(latestStateRef.current.unmatchedColumns.values()).reduce((sum: number, cols) => {
                        return sum + (Array.isArray(cols) ? cols.length : 0);
                    }, 0);
                    addAssistantMessage(`[Loop ${loopCount}] Searching for new matches among ${unmatchedCount} columns...`);
                    setLastToolUsed('find_new_matches');
                    const newSuggestions = await makeApiCallWithRetries(suggestMatchesForUnmatchedColumns, [aiSettings, latestStateRef.current.unmatchedColumns, latestStateRef.current.files, latestStateRef.current.matches], "Matching");
                    
                    if (Array.isArray(newSuggestions) && newSuggestions.length > 0) {
                        addAssistantMessage(`[Loop ${loopCount}] Found ${newSuggestions.length} new potential matches. They will be reviewed in the next loop.`);
                        changesMadeThisCycle = true;
                        newMatchesFound = true;
                        setMatches(prev => [...newSuggestions, ...prev]);
                        updateUnmatchedAfterAction(newSuggestions.flatMap(m => Array.isArray(m.columns) ? m.columns : []));
                    } else {
                        addAssistantMessage(`[Loop ${loopCount}] No new high-confidence matches found.`);
                    }
                } else {
                    addAssistantMessage(`[Loop ${loopCount}] No unmatched columns remain.`);
                }

                // --- PHASE 3: Termination Check ---
                if (!changesMadeThisCycle && !newMatchesFound) {
                    addAssistantMessage("No changes or new matches in this full cycle. Checking confidence before stopping.");
                    const pendingStillExist = latestStateRef.current.matches.some(m => m.status === MatchStatus.PENDING);
                    if (pendingStillExist) {
                        addAssistantMessage("Warning: Some matches remain pending that I couldn't resolve.");
                    }
                    shouldContinue = false;
                }
            } catch (e) {
                shouldContinue = false; // Stop the loop if max retries are hit
            }
        }
        
        const finalPendingCount = latestStateRef.current.matches.filter(m => m.status === MatchStatus.PENDING).length;
        if(finalPendingCount > 0){
             addAssistantMessage(`Autonomous mode complete, but ${finalPendingCount} matches still require manual review.`);
        } else {
            addAssistantMessage("Autonomous mode complete. All matches have been processed.");
        }
        
        if (isFullyAutonomous && finalPendingCount === 0) {
            addAssistantMessage("Generating and downloading your SQL file now...");
            // Trigger download via ExportControl's function
            document.getElementById('export-sql-button')?.click();
        }


        setIsAutonomousMode(false);
        setIsFullyAutonomous(false);
    };

    if (isAutonomousMode) {
        runAutonomousLoop();
    }
  }, [isAutonomousMode, files, isFullyAutonomous, aiSettings]);


  const handleStatusChange = (matchId: string, status: MatchStatus) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status } : m));
  };
  
  const startEditing = (match: Match) => { setEditingMatchId(match.id); setEditingName(match.finalName); };
  const cancelEditing = () => { setEditingMatchId(null); setEditingName(''); };
  const saveEditing = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, finalName: editingName, source: MatchSource.MANUAL } : m));
    cancelEditing();
  };

  const handleCrumbleMatch = useCallback((matchId: string) => {
      const matchToCrumble = matches.find(m => m.id === matchId);
      if (!matchToCrumble) return;
      
      // Add all its columns to unmatched
      setUnmatchedColumns(prev => {
          const newUnmatched = new Map(prev);
          if (Array.isArray(matchToCrumble.columns)) {
            matchToCrumble.columns.forEach(col => {
                const fileCols = newUnmatched.get(col.fileName) || [];
                const fileColsArray = Array.isArray(fileCols) ? fileCols : [];
                if (!fileColsArray.includes(col.columnName)) {
                    newUnmatched.set(col.fileName, [...fileColsArray, col.columnName]);
                }
            });
          }
          return newUnmatched;
      });

      // Remove the match
      setMatches(prev => prev.filter(m => m.id !== matchId));
   }, [matches]);

   const handleDropColumn = useCallback((matchId: string, columnToDrop: ColumnInMatch) => {
      const matchToUpdate = matches.find(m => m.id === matchId);
      if (!matchToUpdate) return;
      
      // If match will have less than 2 columns, crumble it.
      if (!Array.isArray(matchToUpdate.columns) || matchToUpdate.columns.length <= 2) {
           handleCrumbleMatch(matchId);
      } else {
          // Otherwise, just remove the column
          setMatches(prev => prev.map(m => {
              if (m.id === matchId) {
                  return {
                      ...m,
                      columns: Array.isArray(m.columns) ? m.columns.filter(c => !(c.fileId === columnToDrop.fileId && c.columnName === columnToDrop.columnName)) : []
                  };
              }
              return m;
          }));
           // Add the dropped column back to unmatched
          setUnmatchedColumns(prev => {
              const newUnmatched = new Map(prev);
              const fileCols = newUnmatched.get(columnToDrop.fileName) || [];
              const fileColsArray = Array.isArray(fileCols) ? fileCols : [];
              newUnmatched.set(columnToDrop.fileName, [...fileColsArray, columnToDrop.columnName]);
              return newUnmatched;
          });
      }
  }, [matches, handleCrumbleMatch]);

  const handleToggleUnmatchedSelection = useCallback((columnKey: string) => {
      setSelectedUnmatched(prev => {
          const newSet = new Set(prev);
          if (newSet.has(columnKey)) {
              newSet.delete(columnKey);
          } else {
              newSet.add(columnKey);
          }
          return newSet;
      });
  }, []);

  const handleClearUnmatchedSelection = useCallback(() => {
      setSelectedUnmatched(new Set());
  }, []);

  const handleCreateManualMatch = useCallback((finalName: string) => {
      const columnsToMatch: ColumnInMatch[] = [];
      const columnKeysToRemove = new Set<string>();

      selectedUnmatched.forEach(key => {
          const [fileName, columnName] = key.split('::');
          const file = files.find(f => f.name === fileName);
          if (file) {
              columnsToMatch.push({ fileId: file.id, fileName, columnName });
              columnKeysToRemove.add(key);
          }
      });

      if (columnsToMatch.length < 2) return;

      const newMatch: Match = {
          id: uuidv4(),
          columns: columnsToMatch,
          finalName,
          status: MatchStatus.PENDING,
          source: MatchSource.MANUAL,
      };

      setMatches(prev => [newMatch, ...prev]);

      // Remove from unmatched
      setUnmatchedColumns(prev => {
          const newUnmatched = new Map<string, string[]>();
          prev.forEach((cols, file) => {
              const remaining = cols.filter(c => !columnKeysToRemove.has(`${file}::${c}`));
              if (remaining.length > 0) {
                  newUnmatched.set(file, remaining);
              }
          });
          return newUnmatched;
      });

      // Clear selection
      setSelectedUnmatched(new Set());
  }, [selectedUnmatched, files]);

  const toggleMatchSelection = (matchId: string) => {
    setSelectedMatchIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(matchId)) {
            newSet.delete(matchId);
        } else {
            newSet.add(matchId);
        }
        return newSet;
    });
  };

  const handlePreviewData = (columns: ColumnData[]) => {
    if (columns.length > 0) {
      setColumnsToPreview(columns);
      setIsPreviewModalOpen(true);
    }
  };

  const handlePreviewSingleColumn = (e: React.MouseEvent, colInMatch: ColumnInMatch) => {
    e.stopPropagation();
    const colData = allColumns.find(c => c.fileId === colInMatch.fileId && c.originalName === colInMatch.columnName);
    if (colData) {
      handlePreviewData([colData]);
    }
  };

  const handlePreviewAllInMatch = (e: React.MouseEvent, match: Match) => {
    e.stopPropagation();
    const columnsData = (Array.isArray(match.columns) ? match.columns : [])
      .map(colInMatch => allColumns.find(c => c.fileId === colInMatch.fileId && c.originalName === colInMatch.columnName))
      .filter((c): c is ColumnData => !!c);
    handlePreviewData(columnsData);
  };

  const renderMatchCard = (match: Match) => (
    <div key={match.id} onClick={() => toggleMatchSelection(match.id)} className={`bg-white rounded-lg shadow-md border overflow-hidden cursor-pointer transition-all duration-200 flex flex-col hover:shadow-lg ${selectedMatchIds.has(match.id) ? 'border-purple-500 ring-2 ring-purple-500' : 'border-gray-200 hover:border-gray-300'}`}>
      <div className={`p-3 md:p-4 border-b-4 ${match.status === MatchStatus.CONFIRMED ? 'border-green-500' : match.status === MatchStatus.DENIED ? 'border-red-500' : 'border-blue-500'}`}>
        {editingMatchId === match.id ? (
          <div className="flex items-center gap-2">
            <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} onClick={e => e.stopPropagation()} className="font-bold text-base md:text-lg text-gray-800 border-b-2 border-blue-500 focus:outline-none flex-grow min-w-0"/>
            <button onClick={(e) => {e.stopPropagation(); saveEditing(match.id)}} className="text-green-600 hover:text-green-800 flex-shrink-0"><CheckCircleIcon className="w-5 h-5 md:w-6 md:h-6"/></button>
            <button onClick={(e) => {e.stopPropagation(); cancelEditing()}} className="text-red-600 hover:text-red-800 flex-shrink-0"><XCircleIcon className="w-5 h-5 md:w-6 md:h-6"/></button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-base md:text-lg text-gray-800 truncate flex-grow min-w-0" title={match.finalName}>{match.finalName}</h3>
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                <button onClick={(e) => {e.stopPropagation(); handleCrumbleMatch(match.id)}} className="text-gray-500 hover:text-red-600 p-1" title="Crumble this match">
                    <TrashIcon className="w-4 h-4 md:w-5 md:h-5"/>
                </button>
                <button onClick={(e) => handlePreviewAllInMatch(e, match)} className="text-gray-500 hover:text-blue-600 p-1" title="Compare data for all columns in this match">
                    <EyeIcon className="w-4 h-4 md:w-5 md:h-5"/>
                </button>
                <button onClick={(e) => {e.stopPropagation(); startEditing(match)}} className="text-gray-500 hover:text-blue-600 p-1" title="Edit final column name">
                    <EditIcon className="w-4 h-4 md:w-5 md:h-5"/>
                </button>
            </div>
          </div>
        )}
        <div className="text-xs text-gray-500 mt-1.5">
          Source: <span className="font-semibold">{match.source}</span>
          {match.programmaticConfidence && ` | Confidence: ${Math.round(match.programmaticConfidence * 100)}%`}
        </div>
      </div>
      <div className="p-3 md:p-4 bg-gray-50 flex-grow">
        <ul className="space-y-1.5 md:space-y-2">
          {Array.isArray(match.columns) &&
            match.columns.map(col => {
                const file = fileMap.get(col.fileId);
                if (!file) return null;
                return (
                    <li key={col.fileId + col.columnName}
                        className="flex items-center text-xs md:text-sm p-1 md:p-1.5 rounded-md hover:bg-gray-100"
                        style={{ borderLeft: `4px solid ${file.color}` }}
                    >
                      <div className="flex-grow flex items-center min-w-0 ml-2">
                        <div className="flex items-center gap-1 flex-shrink-0 mr-2">
                            <button onClick={(e) => handlePreviewSingleColumn(e, col)} className="text-gray-400 hover:text-blue-500 p-0.5" title={`Preview data for ${col.columnName}`}>
                                <EyeIcon className="w-3.5 h-3.5 md:w-4 md:h-4"/>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDropColumn(match.id, col); }} className="text-gray-400 hover:text-red-500 p-0.5" title={`Drop ${col.columnName} from match`}>
                                <XCircleIcon className="w-3.5 h-3.5 md:w-4 md:h-4"/>
                            </button>
                        </div>
                        <div className="flex flex-wrap items-baseline min-w-0 gap-x-1" title={`${col.fileName}: ${col.columnName}`}>
                           <span className="font-bold text-gray-500 text-xs flex-shrink-0">[{file.sourceId}]</span>
                           <span className="font-medium text-gray-600 truncate">{col.fileName}</span>
                           <span className="text-gray-500 flex-shrink-0">:</span>
                           <span className="font-normal text-gray-800 truncate">{col.columnName}</span>
                        </div>
                      </div>
                    </li>
                )
            })}
        </ul>
      </div>

      {match.aiReview && match.status === MatchStatus.PENDING && (
        <div className="p-3 md:p-4 bg-purple-50 border-t border-b border-purple-200">
            <div className="flex items-start gap-2 md:gap-3">
                <LightbulbIcon className="w-5 h-5 md:w-6 md:h-6 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <h4 className="font-semibold text-sm md:text-base text-purple-800">Chloe's Recommendation: <span className="font-bold">{match.aiReview.action}</span></h4>
                    <p className="text-xs text-purple-700 mt-1 italic break-words">"{match.aiReview.justification}"</p>
                </div>
            </div>
             <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={(e) => {e.stopPropagation(); handleDismissSuggestion(match.id)}} className="flex items-center justify-center py-1.5 md:py-2 px-2 md:px-3 bg-gray-200 text-gray-700 text-xs md:text-sm font-semibold rounded-md hover:bg-gray-300 transition-colors">
                    <XCircleIcon className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-1.5" /> Dismiss
                </button>
                <button onClick={(e) => {e.stopPropagation(); handleApplySuggestion(match.id)}} className="flex items-center justify-center py-1.5 md:py-2 px-2 md:px-3 bg-purple-600 text-white text-xs md:text-sm font-semibold rounded-md hover:bg-purple-700 transition-colors">
                    <CheckCircleIcon className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-1.5" /> Apply
                </button>
            </div>
        </div>
      )}

      {match.status === MatchStatus.PENDING && !match.aiReview && (
        <div className="p-2 md:p-3 bg-gray-100 grid grid-cols-2 gap-2">
          <button onClick={(e) => {e.stopPropagation(); handleStatusChange(match.id, MatchStatus.DENIED)}} className="flex items-center justify-center py-1.5 md:py-2 px-2 md:px-4 bg-red-100 text-red-700 text-xs md:text-sm font-semibold rounded-md hover:bg-red-200 transition-colors">
            <XCircleIcon className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" /> Deny
          </button>
          <button onClick={(e) => {e.stopPropagation(); handleStatusChange(match.id, MatchStatus.CONFIRMED)}} className="flex items-center justify-center py-1.5 md:py-2 px-2 md:px-4 bg-green-100 text-green-700 text-xs md:text-sm font-semibold rounded-md hover:bg-green-200 transition-colors">
            <CheckCircleIcon className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" /> Confirm
          </button>
        </div>
      )}
    </div>
  );

  const allUnmatchedCount = useMemo(() => {
    return Array.from(unmatchedColumns.values()).reduce((acc: number, cols) => {
      return acc + (Array.isArray(cols) ? cols.length : 0);
    }, 0);
  }, [unmatchedColumns]);


  return (
    <>
    <UserGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    <DataPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        columns={columnsToPreview}
    />
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8">
      {/* Main Content Area */}
      <div className="lg:col-span-8 space-y-6 md:space-y-8">
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Review Column Matches</h2>
                <button
                    onClick={() => setIsGuideOpen(true)}
                    className="flex items-center justify-center sm:justify-start space-x-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    title="Show User Guide"
                >
                    <QuestionMarkCircleIcon className="w-5 h-5 md:w-6 md:h-6"/>
                    <span>How does this work?</span>
                </button>
            </div>
            <p className="text-sm md:text-base text-gray-600 mt-2">Confirm or deny the suggested matches. Click a card to select it for chat, or use the <EyeIcon className="w-4 h-4 inline -mt-1"/> icons to preview data.</p>
        </div>

        {/* Pending Matches Section */}
        <section>
          <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-gray-700">Pending Review ({pendingMatches.length})</h3>
          {pendingMatches.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {pendingMatches.map(renderMatchCard)}
            </div>
          ) : (
            <div className="text-center py-8 md:py-12 bg-gray-50 rounded-lg">
              <CheckCircleIcon className="w-12 h-12 md:w-16 md:h-16 text-green-500 mx-auto" />
              <p className="mt-3 md:mt-4 font-semibold text-lg md:text-xl text-gray-700">All matches reviewed!</p>
            </div>
          )}
        </section>

        {/* Confirmed Matches Section */}
        {confirmedMatches.length > 0 && (
          <section>
            <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-gray-700">Confirmed Matches ({confirmedMatches.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {confirmedMatches.map(renderMatchCard)}
            </div>
          </section>
        )}
      </div>

      {/* Sidebar */}
      <aside className="lg:col-span-4 space-y-4 md:space-y-6">
        {/* Proceed Button */}
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border sticky top-4 z-20">
            <button
                onClick={() => onProceed(matches)}
                disabled={pendingMatches.length > 0}
                className="w-full py-2.5 md:py-3 px-4 bg-green-600 text-white text-sm md:text-base font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
                Proceed to Results ({confirmedMatches.length} confirmed)
            </button>
        </div>

        {/* Source Files Control */}
        <SourceFilesControl
            files={files}
            onColorChange={handleColorChange}
        />

        {/* Export Control */}
        <ExportControl
            matches={matches}
            unmatchedColumns={unmatchedColumns}
            files={files}
        />

        {/* AI Settings */}
        <AISettingsControl
            aiSettings={aiSettings}
            setAiSettings={setAiSettings}
        />

        {/* Manual Matching Panel */}
        {allUnmatchedCount > 0 && (
            <ManualMatchPanel
                unmatchedColumns={unmatchedColumns}
                files={files}
                onPreview={handlePreviewData}
                onCreateMatch={handleCreateManualMatch}
                selectedUnmatched={selectedUnmatched}
                onToggleSelect={handleToggleUnmatchedSelection}
                onClearSelection={handleClearUnmatchedSelection}
            />
        )}

        {/* Chat Assistant */}
        <div className="sticky top-4" style={{height: 'clamp(300px, 40rem, calc(100vh - 2rem))'}}>
             <ChatAssistant
                aiSettings={aiSettings}
                messages={messages}
                setMessages={setMessages}
                isLoading={isChatLoading || isAutonomousMode}
                setIsLoading={setIsChatLoading}
                onToolCall={handleToolCall}
                selectedMatchIds={selectedMatchIds}
                onClearSelection={() => setSelectedMatchIds(new Set())}
                allMatches={matches}
                pendingMatchesCount={pendingMatches.length}
                confirmedMatchesCount={confirmedMatches.length}
                unmatchedColumnsCount={allUnmatchedCount}
                lastToolUsed={lastToolUsed}
            />
        </div>
      </aside>
    </div>
    </>
  );
};