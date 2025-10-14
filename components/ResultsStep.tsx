
import React, { useMemo, useState } from 'react';
import type { Match, UploadedFile, ColumnData } from '../types';
import { MatchStatus } from '../types';

interface ResultsStepProps {
  matches: Match[];
  files: UploadedFile[];
  onReset: () => void;
}

/**
 * Helper to get the ColumnData for a given column in a file
 */
function getColumnData(fileId: string, columnName: string, files: UploadedFile[]): ColumnData | undefined {
  const file = files.find(f => f.id === fileId);
  return file?.columns.find(c => c.originalName === columnName);
}

/**
 * Detects if a match has columns with different data types
 * Returns true if conversion to VARCHAR is needed
 */
function needsTypeConversion(match: Match, files: UploadedFile[]): boolean {
  if (match.columns.length <= 1) return false;

  const types = new Set<string>();
  for (const col of match.columns) {
    const colData = getColumnData(col.fileId, col.columnName, files);
    if (colData) {
      types.add(colData.dataType);
    }
  }

  // If we have more than one distinct type, we need conversion
  return types.size > 1;
}

function generateSnowflakeSQL(matches: Match[], files: UploadedFile[]): string {
    const confirmedMatches = matches.filter(m => m.status === MatchStatus.CONFIRMED);

    // Build comprehensive list of ALL columns (matched + unmatched) - NO DATA LOSS
    const allColumnsSet = new Set<string>();

    // Add all matched columns
    confirmedMatches.forEach(m => allColumnsSet.add(m.finalName));

    // Add all unmatched columns from all files
    files.forEach(file => {
        file.columns.forEach(col => {
            // Check if this column is part of a confirmed match
            const isMatched = confirmedMatches.some(match =>
                match.columns.some(matchCol => matchCol.fileId === file.id && matchCol.columnName === col.originalName)
            );
            if (!isMatched) {
                allColumnsSet.add(col.originalName);
            }
        });
    });

    const sortedColumnNames = Array.from(allColumnsSet).sort();

    if (sortedColumnNames.length === 0) {
        return "-- No columns to generate SQL. Please upload files with columns.";
    }

    // Detect which matches need type conversion
    const matchesNeedingConversion = new Map<string, boolean>();
    confirmedMatches.forEach(match => {
        matchesNeedingConversion.set(match.finalName, needsTypeConversion(match, files));
    });

    const unionParts = files.map(file => {
        const selectClauses = sortedColumnNames.map(columnName => {
            // Check if it's a confirmed match
            const match = confirmedMatches.find(m => m.finalName === columnName);

            if (match) {
                // This is a matched column
                const columnInFile = match.columns.find(c => c.fileId === file.id);
                const needsConversion = matchesNeedingConversion.get(columnName);

                if (columnInFile) {
                    // Column exists in this file
                    if (needsConversion) {
                        // Cast to VARCHAR for type compatibility
                        return `    CAST("${columnInFile.columnName}" AS VARCHAR) AS "${columnName}"`;
                    } else {
                        // No type mismatch, use as-is
                        return `    "${columnInFile.columnName}" AS "${columnName}"`;
                    }
                } else {
                    // Matched column doesn't exist in this file, use NULL
                    return `    NULL AS "${columnName}"`;
                }
            } else {
                // This is an unmatched column - check if this file has it
                const columnInFile = file.columns.find(c => c.originalName === columnName);
                if (columnInFile) {
                    // Unmatched column exists in this file
                    return `    "${columnName}" AS "${columnName}"`;
                } else {
                    // Unmatched column doesn't exist in this file, use NULL
                    return `    NULL AS "${columnName}"`;
                }
            }
        });

        // A simplified placeholder for table name. In a real scenario, this would be more robust.
        const tableName = `your_schema."${file.name.split('.')[0]}"`;
        return `SELECT\n${selectClauses.join(',\n')}\nFROM ${tableName}`;
    });

    // Build type conversion warnings
    const typeConversionWarnings = Array.from(matchesNeedingConversion.entries())
        .filter(([_, needsConversion]) => needsConversion)
        .map(([columnName]) => {
            const match = confirmedMatches.find(m => m.finalName === columnName);
            if (!match) return '';

            const types = match.columns.map(col => {
                const colData = getColumnData(col.fileId, col.columnName, files);
                return `${col.fileName}:${col.columnName} (${colData?.dataType || 'unknown'})`;
            }).join(', ');

            return `--   "${columnName}": Type mismatch detected [${types}] - converted to VARCHAR`;
        })
        .filter(w => w.length > 0);

    const typeWarningSection = typeConversionWarnings.length > 0
        ? `\n-- TYPE CONVERSION APPLIED:\n-- The following columns have been automatically CAST to VARCHAR due to type mismatches:\n${typeConversionWarnings.join('\n')}\n`
        : '';

    // VERIFICATION: Count total columns from all files to ensure none are lost
    const totalOriginalColumns = files.reduce((sum, file) => sum + file.columns.length, 0);
    const totalUnmatchedColumns = sortedColumnNames.length - confirmedMatches.length;

    const verificationSection = `\n-- DATA PRESERVATION VERIFICATION:\n-- Total columns in source files: ${totalOriginalColumns}\n-- Total columns in output (after matching): ${sortedColumnNames.length}\n-- Confirmed matches: ${confirmedMatches.length}\n-- Unmatched columns preserved: ${totalUnmatchedColumns}\n`;

    return `
-- Generated Snowflake SQL for Table Union
-- Note: Replace placeholder table names with your actual Snowflake table names.${verificationSection}${typeWarningSection}

${unionParts.join('\n\nUNION ALL\n\n')}
`;
}


export const ResultsStep: React.FC<ResultsStepProps> = ({ matches, files, onReset }) => {
  const [copied, setCopied] = useState(false);
  const confirmedMatches = useMemo(() => matches.filter(m => m.status === MatchStatus.CONFIRMED), [matches]);
  const sql = useMemo(() => generateSnowflakeSQL(matches, files), [matches, files]);

  // Check if any matches have type mismatches
  const hasTypeMismatches = useMemo(() => {
    return confirmedMatches.some(match => needsTypeConversion(match, files));
  }, [confirmedMatches, files]);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-4">Results</h2>
      <p className="text-gray-600 mb-4">Here is the generated Snowflake SQL and a summary of the column unions.</p>

      {hasTypeMismatches && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Type Conversion Applied</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Some matched columns have different data types and have been automatically converted to VARCHAR in the SQL for compatibility. See SQL comments for details.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SQL Output */}
        <div>
          <h3 className="text-xl font-semibold mb-2">Generated Snowflake SQL</h3>
          <div className="relative bg-gray-800 text-white p-4 rounded-lg font-mono text-sm h-96 overflow-auto">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 bg-gray-600 hover:bg-gray-500 text-white text-xs font-semibold py-1 px-3 rounded"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <pre><code>{sql}</code></pre>
          </div>
        </div>

        {/* Mappings Summary */}
        <div>
          <h3 className="text-xl font-semibold mb-2">Confirmed Column Mappings</h3>
          <div className="bg-gray-50 p-4 rounded-lg h-96 overflow-auto">
            {confirmedMatches.length > 0 ? (
              <div className="space-y-4">
                {confirmedMatches.map(match => (
                  <div key={match.id} className="border-b pb-3">
                    <h4 className="font-bold text-blue-700">"{match.finalName}"</h4>
                    <ul className="list-disc list-inside mt-1 pl-2 text-sm text-gray-700">
                      {match.columns.map(col => (
                        <li key={`${col.fileId}-${col.columnName}`}>
                          <span className="font-semibold">{col.fileName}:</span> {col.columnName}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center pt-10">No matches were confirmed.</p>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-10">
        <button onClick={onReset} className="bg-gray-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-gray-700 text-lg transition-colors">
          Start Over
        </button>
      </div>
    </div>
  );
};
