
import React, { useMemo, useState } from 'react';
import type { Match, UploadedFile } from '../types';
import { MatchStatus } from '../types';

interface ResultsStepProps {
  matches: Match[];
  files: UploadedFile[];
  onReset: () => void;
}

function generateSnowflakeSQL(matches: Match[], files: UploadedFile[]): string {
    const confirmedMatches = matches.filter(m => m.status === MatchStatus.CONFIRMED);
    if (confirmedMatches.length === 0) {
        return "-- No confirmed matches to generate SQL.";
    }

    const allColumnsInMatches = new Set<string>();
    confirmedMatches.forEach(m => {
        allColumnsInMatches.add(m.finalName);
    });

    const unionParts = files.map(file => {
        const selectClauses = confirmedMatches.map(match => {
            const columnInFile = match.columns.find(c => c.fileId === file.id);
            if (columnInFile) {
                return `    "${columnInFile.columnName}" AS "${match.finalName}"`;
            } else {
                return `    NULL AS "${match.finalName}"`;
            }
        });

        // A simplified placeholder for table name. In a real scenario, this would be more robust.
        const tableName = `your_schema."${file.name.split('.')[0]}"`;
        return `SELECT\n${selectClauses.join(',\n')}\nFROM ${tableName}`;
    });

    return `
-- Generated Snowflake SQL for Table Union
-- Note: Replace placeholder table names with your actual Snowflake table names.

${unionParts.join('\n\nUNION ALL\n\n')}
`;
}


export const ResultsStep: React.FC<ResultsStepProps> = ({ matches, files, onReset }) => {
  const [copied, setCopied] = useState(false);
  const confirmedMatches = useMemo(() => matches.filter(m => m.status === MatchStatus.CONFIRMED), [matches]);
  const sql = useMemo(() => generateSnowflakeSQL(matches, files), [matches, files]);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-4">Results</h2>
      <p className="text-gray-600 mb-8">Here is the generated Snowflake SQL and a summary of the column unions.</p>
      
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
