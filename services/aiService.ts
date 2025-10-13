import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import type {
    Match,
    UploadedFile,
    ColumnData,
    ColumnInMatch,
    AIReview,
    AISettings,
    AIModelInfo,
    AIProviderConfig
} from '../types';
import { AIProvider } from '../types';
import { MatchSource, MatchStatus, AIRecommendedAction } from '../types';

// ============================================================================
// ABSTRACT AI PROVIDER INTERFACE
// ============================================================================

interface AIProviderInterface {
    generateContent(prompt: string, schema?: any): Promise<string>;
    listModels(): Promise<AIModelInfo[]>;
    createChat?(systemPrompt: string): any; // Optional for future chat implementation
}

// ============================================================================
// GEMINI PROVIDER IMPLEMENTATION
// ============================================================================

class GeminiProvider implements AIProviderInterface {
    private ai: GoogleGenAI;
    private modelId: string;

    constructor(apiKey: string, modelId: string) {
        this.ai = new GoogleGenAI({ apiKey });
        this.modelId = modelId;
    }

    async generateContent(prompt: string, schema?: any): Promise<string> {
        const config: any = {};
        
        if (schema) {
            config.responseMimeType = "application/json";
            config.responseSchema = schema;
        }

        const response = await this.ai.models.generateContent({
            model: this.modelId,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined
        });

        return response.text.trim();
    }

    async listModels(): Promise<AIModelInfo[]> {
        // Note: This requires the API key to be valid
        // We'll make a direct HTTP request to the Gemini models.list endpoint
        const apiKey = (this.ai as any).apiKey; // Access the stored API key
        
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            
            // Filter models that support generateContent
            const models = data.models
                ?.filter((model: any) => {
                    const methods = model.supportedGenerationMethods || [];
                    return methods.includes('generateContent');
                })
                .map((model: any) => ({
                    id: model.name.replace('models/', ''), // Remove 'models/' prefix
                    name: model.displayName || model.name,
                    provider: AIProvider.GEMINI as AIProvider,
                    isCustom: false
                })) || [];

            return models;
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            // Return fallback models if API call fails
            return [
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash',
                    provider: AIProvider.GEMINI as AIProvider,
                    isCustom: false
                },
                {
                    id: 'gemini-1.5-pro',
                    name: 'Gemini 1.5 Pro',
                    provider: AIProvider.GEMINI as AIProvider,
                    isCustom: false
                }
            ];
        }
    }
}

// ============================================================================
// ANTHROPIC PROVIDER IMPLEMENTATION
// ============================================================================

class AnthropicProvider implements AIProviderInterface {
    private apiKey: string;
    private modelId: string;

    constructor(apiKey: string, modelId: string) {
        this.apiKey = apiKey;
        this.modelId = modelId;
    }

    async generateContent(prompt: string, schema?: any): Promise<string> {
        // Make direct HTTP request to Anthropic API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.modelId,
                max_tokens: 4096,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Extract text from the response
        const textContent = data.content
            ?.find((block: any) => block.type === 'text')
            ?.text || '';

        return textContent;
    }

    async listModels(): Promise<AIModelInfo[]> {
        // Return static list of Anthropic models
        return [
            {
                id: 'claude-3-5-sonnet-20241022',
                name: 'Claude 3.5 Sonnet',
                provider: AIProvider.ANTHROPIC as AIProvider,
                isCustom: false
            },
            {
                id: 'claude-3-5-haiku-20241022',
                name: 'Claude 3.5 Haiku',
                provider: AIProvider.ANTHROPIC as AIProvider,
                isCustom: false
            },
            {
                id: 'claude-3-opus-20240229',
                name: 'Claude 3 Opus',
                provider: AIProvider.ANTHROPIC as AIProvider,
                isCustom: false
            }
        ];
    }
}

// ============================================================================
// UNIFIED SERVICE FUNCTIONS
// ============================================================================

/**
 * Gets the active AI provider instance based on settings
 */
export function getActiveAIProvider(settings: AISettings): AIProviderInterface {
    const activeConfig = settings.providers[settings.activeProvider];
    
    if (!activeConfig.apiKey) {
        throw new Error(`API key not configured for ${settings.activeProvider}`);
    }

    if (!activeConfig.selectedModel) {
        throw new Error(`No model selected for ${settings.activeProvider}`);
    }

    switch (settings.activeProvider) {
        case AIProvider.GEMINI:
            return new GeminiProvider(activeConfig.apiKey, activeConfig.selectedModel);
        case AIProvider.ANTHROPIC:
            return new AnthropicProvider(activeConfig.apiKey, activeConfig.selectedModel);
        default:
            throw new Error(`Unsupported provider: ${settings.activeProvider}`);
    }
}

/**
 * Generates AI content using the active provider
 */
export async function generateAIContent(
    settings: AISettings,
    prompt: string,
    schema?: any
): Promise<string> {
    const provider = getActiveAIProvider(settings);
    return provider.generateContent(prompt, schema);
}

/**
 * Fetches available models from the specified provider
 */
export async function fetchAvailableModels(
    provider: AIProvider,
    apiKey: string
): Promise<AIModelInfo[]> {
    // Create a temporary provider instance with a default model just for listing
    let providerInstance: AIProviderInterface;
    
    switch (provider) {
        case AIProvider.GEMINI:
            providerInstance = new GeminiProvider(apiKey, 'gemini-2.5-flash');
            break;
        case AIProvider.ANTHROPIC:
            providerInstance = new AnthropicProvider(apiKey, 'claude-3-5-sonnet-20241022');
            break;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    return providerInstance.listModels();
}

// ============================================================================
// TOOL DECLARATIONS FOR CHAT (Compatible with both providers)
// ============================================================================

export const toolDeclarations: FunctionDeclaration[] = [
    {
        name: 'get_column_details',
        description: 'Retrieves a detailed analysis of a specific column, including data type, uniqueness, value distribution for categories, and statistical summary for numbers. Use this to verify if two columns contain semantically similar data before suggesting or confirming a match.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                fileName: { type: Type.STRING, description: 'The name of the file containing the column.' },
                columnName: { type: Type.STRING, description: 'The name of the column to analyze.' }
            },
            required: ['fileName', 'columnName']
        }
    },
    {
        name: 'search_column_content',
        description: 'Performs a deep content comparison between two specific columns. It checks for value overlap, statistical similarity for numbers, and pattern matching for strings. Use this tool to definitively confirm or deny a questionable match when column names are ambiguous but you suspect the data might be related.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                sourceFileName: { type: Type.STRING, description: "The file name of the first column." },
                sourceColumnName: { type: Type.STRING, description: "The name of the first column." },
                targetFileName: { type: Type.STRING, description: "The file name of the second column." },
                targetColumnName: { type: Type.STRING, description: "The name of the second column." },
            },
            required: ['sourceFileName', 'sourceColumnName', 'targetFileName', 'targetColumnName']
        }
    },
    {
        name: 'find_new_matches',
        description: 'Analyzes all currently unmatched columns across all files to find and suggest new potential matches.',
        parameters: { type: Type.OBJECT, properties: {} }
    },
    {
        name: 'review_all_matches',
        description: 'Performs an expert review of all current matches that are in the "Pending" state and have not been reviewed by the AI yet.',
        parameters: { type: Type.OBJECT, properties: {} }
    },
    {
        name: 'apply_all_suggestions',
        description: "Automatically applies all of the AI's current recommendations on the pending cards.",
        parameters: { type: Type.OBJECT, properties: {} }
    },
    {
        name: 'start_autonomous_mode',
        description: "Initiates a fully automatic process where the AI will repeatedly review, match, and apply suggestions until it's confident that all possible columns have been matched.",
        parameters: { type: Type.OBJECT, properties: {} }
    },
    {
        name: 'start_fully_autonomous_mode',
        description: "Initiates a fully automatic process (review, match, apply) and then automatically generates and downloads the final Snowflake SQL file.",
        parameters: { type: Type.OBJECT, properties: {} }
    }
];

// ============================================================================
// HELPER FUNCTIONS (from geminiService.ts)
// ============================================================================

export function generateColumnProfile(column: ColumnData): object {
    const profile: any = {
        name: column.originalName,
        file: column.fileName,
        dataType: column.dataType,
    };

    const sampleData = column.sampleData.filter(d => d !== null && d !== undefined && d !== '');
    const nonNullCount = sampleData.length;
    if (nonNullCount === 0) {
        profile.summary = "Column is empty or all nulls.";
        return profile;
    }

    const valueSet = new Set(sampleData);
    const uniquenessRatio = valueSet.size / nonNullCount;
    profile.uniquenessRatio = `${(uniquenessRatio * 100).toFixed(1)}%`;

    if (column.dataType === 'number') {
        const numericData = sampleData.map(Number).filter(n => !isNaN(n));
        if (numericData.length > 1) {
            const n = numericData.length;
            const sum = numericData.reduce((a, b) => a + b, 0);
            const mean = sum / n;
            const min = Math.min(...numericData);
            const max = Math.max(...numericData);
            const stddev = Math.sqrt(numericData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
            profile.stats = {
                min: min,
                max: max,
                mean: parseFloat(mean.toFixed(2)),
                stddev: parseFloat(stddev.toFixed(2)),
            };
        }
    } else { // For string, date, boolean, mixed
        if (uniquenessRatio < 0.8 && valueSet.size <= 25) {
            // It's likely categorical data, show all unique values
            profile.uniqueValues = Array.from(valueSet);
        } else {
            // High cardinality, just show a sample
            profile.sampleValues = sampleData.slice(0, 10);
        }
    }
    return profile;
}

function getRichColumnContext(columns: (ColumnData | ColumnInMatch)[], allFiles: UploadedFile[]): string {
    return columns.map(c => {
        const colName = "columnName" in c ? c.columnName : c.originalName;
        const colData = allFiles.flatMap(f => f.columns).find(col => col.fileName === c.fileName && col.originalName === colName);
        if (!colData) return `  - ${c.fileName} -> ${colName}: (metadata not found)`;
        
        const profile = generateColumnProfile(colData);
        // Convert profile to a compact string for the prompt
        return `  - Column Profile: ${JSON.stringify(profile)}`;
    }).join('\n');
}

function getFileSummary(files: UploadedFile[]): string {
    return files.map(f => `File: ${f.name} (Columns: ${f.columns.map(c => `"${c.originalName}"`).join(', ')})`).join('\n');
}

// ============================================================================
// MAIN AI FUNCTIONS (Updated to accept AISettings)
// ============================================================================

export async function suggestMatchesForUnmatchedColumns(
    settings: AISettings,
    unmatched: Map<string, string[]>,
    files: UploadedFile[],
    existingMatches: Match[]
): Promise<Match[]> {
    const allUnmatchedCols: ColumnData[] = [];
    files.forEach(file => {
        const unmatchedNames = unmatched.get(file.name) || [];
        unmatchedNames.forEach(colName => {
            const col = file.columns.find(c => c.originalName === colName);
            if(col) allUnmatchedCols.push(col);
        })
    })

    if(allUnmatchedCols.length < 2) return [];

    const prompt = `You are a meticulous data analyst AI. Your primary goal is to identify columns that represent the exact same semantic entity and can be safely unioned.

**CRITICAL RULES:**
1.  **SEMANTIC EQUIVALENCE IS REQUIRED:** A match is only valid if the columns contain the same *kind* of information. Use the detailed column profiles to verify this. A strong name match is NEVER sufficient on its own.
2.  **ANALYZE DATA RELATIONSHIPS:** Be extremely cautious with columns that seem related but are not identical. For example:
    - \`points_spent\` vs. \`points_remaining\`: These are NOT a match. One is a transaction, the other is a balance.
    - \`start_date\` vs. \`end_date\`: These are NOT a match. They represent different points in time.
    - \`gross_amount\` vs. \`net_amount\`: These are NOT a match. They are different calculation results.
    You must identify the *purpose* of the column (e.g., balance, transaction, identifier, attribute) before matching.
3.  **VERIFY WITH NUMERIC STATS:** For numeric columns, if their statistical profiles (mean, max) are vastly different (e.g., by an order of magnitude), they are likely not a match even if their names are similar. For example, a column of \`transaction_amounts\` (likely small numbers) should not be matched with \`total_balance\` (likely large numbers).
4.  **NO MISCELLANEOUS DUMPING GROUNDS:** You are strictly forbidden from creating a match with a generic name like "miscellaneous", "misc", "other", or "unclassified" simply to group unrelated columns.
5.  **VALID GROUPS ONLY:** Every suggested match group MUST contain columns from at least TWO DIFFERENT files.

CONTEXT:
${getFileSummary(files)}
EXISTING MATCHES (do not suggest columns already in these matches):
${existingMatches.map(m => `- ${m.finalName}: [${m.columns.map(c => c.columnName).join(', ')}]`).join('\n')}

UNMATCHED COLUMNS TO ANALYZE (with detailed profiles):
${getRichColumnContext(allUnmatchedCols, files)}

Based on the rules and the data provided, identify groups of columns that represent the same information. Return your answer as a JSON array of match objects. If you cannot find any new valid matches, return an empty array.`;

    try {
        const schema = {
            type: Type.ARRAY, 
            items: { 
                type: Type.OBJECT, 
                properties: {
                    justification: { type: Type.STRING }, 
                    finalName: { type: Type.STRING },
                    columns: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: {
                                fileName: { type: Type.STRING }, 
                                columnName: { type: Type.STRING }
                            }, 
                            required: ['fileName', 'columnName'] 
                        }
                    }
                }, 
                required: ['justification', 'finalName', 'columns'] 
            }
        };

        const responseText = await generateAIContent(settings, prompt, schema);
        const suggested = JSON.parse(responseText) as { justification: string; finalName: string; columns: ColumnInMatch[] }[];

        // Programmatic Guardrail: Filter out invalid suggestions from the AI.
        const sanitizedSuggestions = suggested.filter(s => {
            if (!s.columns || s.columns.length < 2) {
                return false; // Not a match.
            }
            const finalNameLower = s.finalName.toLowerCase();
            const isMiscMatch = finalNameLower.includes('misc') || finalNameLower.includes('other') || finalNameLower.includes('unclassified');
            const fileNames = new Set(s.columns.map(c => c.fileName));

            // Rule: All matches must contain columns from at least two different files.
            if (fileNames.size < 2) {
                return false;
            }

            // Rule: If it's a "misc" match, apply extra scrutiny (already covered by file count, but could add more here).
            if (isMiscMatch) {
               // This is a basic check. The prompt is the primary enforcer here.
            }
            
            return true; // Keep the suggestion
        });

        return sanitizedSuggestions.map((s, index): Match | null => {
            const validColumns = s.columns.map(c => {
                const file = files.find(f => f.name === c.fileName);
                return file ? { ...c, fileId: file.id } : null;
            }).filter((c): c is ColumnInMatch & { fileId: string } => c !== null);
            if (validColumns.length < 2) return null;
            return {
                id: `ai-match-${Date.now()}-${index}`, 
                columns: validColumns, 
                status: MatchStatus.PENDING,
                source: MatchSource.AI, 
                finalName: s.finalName, 
                justification: s.justification, 
                aiConfidence: 0.9,
            };
        }).filter((m): m is Match => m !== null);
    } catch (error) { 
        console.error("Error calling AI API for suggestions:", error); 
        throw new Error("Failed to get suggestions from the AI."); 
    }
}

export async function reviewAllPendingMatches(
    settings: AISettings,
    pendingMatches: Match[],
    files: UploadedFile[]
): Promise<(AIReview & {matchId: string})[]> {
    if (pendingMatches.length === 0) return [];
    
    const prompt = `You are a skeptical expert data analyst AI acting as an auditor. Your goal is to prevent incorrect data unions. For each proposed match, you must rigorously verify that the columns are semantically identical using their detailed data profiles.

**CRITICAL REVIEW GUIDELINES:**
1.  **BE A SKEPTICAL AUDITOR:** Your primary job is to find flaws and prevent bad unions. Do not trust column names. A match is only correct if the data inside the columns represents the exact same real-world concept.
2.  **CHECK FOR CALCULATION AND CONTEXT MISMATCHES:** You MUST deny matches between columns that represent different states or calculations of the same entity. For example:
    - \`points_spent\` vs. \`points_remaining\` -> DENY (transaction vs. balance)
    - \`start_date\` vs. \`end_date\` -> DENY (different points in time)
    - \`gross_amount\` vs. \`net_amount\` -> DENY (different calculation results)
    - \`transaction_value\` vs. \`account_balance\` -> DENY (different numeric scales and purposes)
    Use the numeric stats in the profiles to identify these mismatches. If the means or ranges are orders of magnitude apart, it's a huge red flag.
3.  **MODIFY for Improvement:** If a match is mostly correct but contains an incorrect column, recommend \`MODIFY\` and you MUST provide the corrected list of columns in 'suggestedColumns'.
4.  **DENY Incorrect Matches:** If columns clearly do not belong together based on their data profiles (e.g., semantic mismatch, different numeric scales, incompatible categories), you MUST recommend \`DENY\`.
5.  **SPECIAL SCRUTINY FOR "MISC" MATCHES:** If you are reviewing a match with a generic name like "misc" or "miscellaneous":
    - Scrutinize it with extreme prejudice. It is likely incorrect.
    - Before confirming, you MUST check if any column within this "misc" match has a higher-confidence potential match with any other unmatched column or any other existing match.
    - If a column has a better home, you MUST recommend \`MODIFY\` to move it out of the "misc" group.
    - Only \`CONFIRM\` a "misc" match as a last resort if all columns are truly generic, have similar names (e.g., 'notes', 'misc_info'), come from different files, and have no better place to be matched.

CONTEXT:
${getFileSummary(files)}

MATCHES TO REVIEW (with detailed profiles):
${pendingMatches.map(m => `
- Match ID: "${m.id}"
  Proposed Name: "${m.finalName}"
  Columns:
${getRichColumnContext(m.columns, files)}
`).join('')}

Return a JSON array of review objects.`;
    
    try {
        const schema = {
            type: Type.ARRAY, 
            items: { 
                type: Type.OBJECT, 
                properties: {
                    matchId: { type: Type.STRING },
                    action: { type: Type.STRING, enum: Object.values(AIRecommendedAction) },
                    justification: { type: Type.STRING },
                    suggestedColumns: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: {
                                fileName: { type: Type.STRING }, 
                                columnName: { type: Type.STRING }
                            }, 
                            required: ['fileName', 'columnName'] 
                        }
                    }
                }, 
                required: ['matchId', 'action', 'justification'] 
            }
        };

        const responseText = await generateAIContent(settings, prompt, schema);
        return JSON.parse(responseText) as (AIReview & {matchId: string})[];
    } catch (error) { 
        console.error("Error calling AI API for review:", error); 
        throw new Error("Failed to get reviews from the AI."); 
    }
}

export async function getCompletenessScore(
    settings: AISettings,
    unmatched: Map<string, string[]>,
    files: UploadedFile[]
): Promise<number> {
    const allUnmatchedCols: ColumnData[] = [];
    files.forEach(file => {
        const unmatchedNames = unmatched.get(file.name) || [];
        unmatchedNames.forEach(colName => {
            const col = file.columns.find(c => c.originalName === colName);
            if(col) allUnmatchedCols.push(col);
        })
    });

    if (allUnmatchedCols.length < 2) return 100;

    const prompt = `You are an expert data analyst AI. Based on the detailed profiles of the remaining unmatched columns listed below, estimate your confidence that no more valid matches can be found.
A high confidence (e.g., 95) means you believe the remaining columns are unique and should not be matched.
A low confidence (e.g., 30) means you strongly suspect there are still valid matches to be found among them.

UNMATCHED COLUMNS:
${getRichColumnContext(allUnmatchedCols, files)}

What is your confidence score (0-100) that no more valid matches exist? Return only the number.`;

    try {
        const schema = { 
            type: Type.OBJECT, 
            properties: { 
                score: { type: Type.NUMBER } 
            }, 
            required: ['score'] 
        };

        const responseText = await generateAIContent(settings, prompt, schema);
        const result = JSON.parse(responseText);
        return result.score || 0;
    } catch (error) {
        console.error("Error getting completeness score:", error);
        return 0;
    }
}