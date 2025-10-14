import type { Match, UploadedFile, ColumnData } from '../types';
import { MatchStatus } from '../types';

/**
 * Triggers a browser download for the given content.
 * @param content The string content of the file.
 * @param fileName The desired name of the file.
 * @param mimeType The MIME type of the file.
 */
function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


export interface SqlExportOptions {
  includeSource: boolean;
  sourceColumnName: string;
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

/**
 * Generates a Snowflake SQL query to union all tables based on the current mapping state.
 * Includes ALL columns (confirmed matches AND unmatched) to preserve all data.
 * Automatically detects type mismatches and converts to VARCHAR for compatibility.
 * CRITICAL: No columns are omitted - all data is preserved in the union.
 */
export function generateSql(
  matches: Match[],
  unmatchedColumns: Map<string, string[]>,
  files: UploadedFile[],
  options: SqlExportOptions
): void {
  const confirmedMatches = matches.filter(m => m.status === MatchStatus.CONFIRMED);

  // Combine originally unmatched columns with columns from non-confirmed matches
  // This ensures NO data is lost - all columns from all files are included
  const comprehensiveUnmatched = new Map<string, Set<string>>();
  unmatchedColumns.forEach((cols, file) => comprehensiveUnmatched.set(file, new Set(cols)));

  matches.filter(m => m.status !== MatchStatus.CONFIRMED).forEach(m => {
      m.columns.forEach(col => {
          if (!comprehensiveUnmatched.has(col.fileName)) {
              comprehensiveUnmatched.set(col.fileName, new Set());
          }
          comprehensiveUnmatched.get(col.fileName)!.add(col.columnName);
      });
  });

  // Build comprehensive list of ALL columns (matched + unmatched) - NO DATA LOSS
  const allFinalColumns = new Set<string>();
  confirmedMatches.forEach(m => allFinalColumns.add(m.finalName));
  comprehensiveUnmatched.forEach(cols => cols.forEach(c => allFinalColumns.add(c)));

  if (allFinalColumns.size === 0) {
    alert("No columns to export. Confirm some matches or upload files with columns.");
    return;
  }

  // Sort all columns for consistent ordering
  const finalColumnList = Array.from(allFinalColumns).sort();

  // Detect which matches need type conversion
  const matchesNeedingConversion = new Map<string, boolean>();
  confirmedMatches.forEach(match => {
    matchesNeedingConversion.set(match.finalName, needsTypeConversion(match, files));
  });

  const unionParts = files.map(file => {
    const selectClauses = finalColumnList.map(finalColName => {
      // Check if it's a confirmed match first
      const match = confirmedMatches.find(m => m.finalName === finalColName);

      if (match) {
        // This is a matched column
        const columnInFile = match.columns.find(c => c.fileId === file.id);
        const needsConversion = matchesNeedingConversion.get(finalColName);

        if (columnInFile) {
          // Column exists in this file
          if (needsConversion) {
            // Cast to VARCHAR for type compatibility
            return `    CAST("${columnInFile.columnName}" AS VARCHAR) AS "${finalColName}"`;
          } else {
            // No type mismatch, use as-is
            return `    "${columnInFile.columnName}" AS "${finalColName}"`;
          }
        } else {
          // Matched column doesn't exist in this file, use NULL
          return `    NULL AS "${finalColName}"`;
        }
      } else {
        // This is an unmatched column - check if this file has it
        const isUnmatchedInFile = comprehensiveUnmatched.get(file.name)?.has(finalColName);
        if (isUnmatchedInFile) {
          // Unmatched column exists in this file
          return `    "${finalColName}" AS "${finalColName}"`;
        } else {
          // Unmatched column doesn't exist in this file, use NULL
          return `    NULL AS "${finalColName}"`;
        }
      }
    });

    if (options.includeSource) {
        // Use default if name is empty
        const sourceColName = options.sourceColumnName.trim() || 'SOURCE_FILE_NAME';
        selectClauses.unshift(`    '${file.name}' AS "${sourceColName}"`);
    }

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
  const totalOutputColumns = allFinalColumns.size;

  const verificationSection = `\n-- DATA PRESERVATION VERIFICATION:\n-- Total columns in source files: ${totalOriginalColumns}\n-- Total columns in output (after matching): ${totalOutputColumns}\n-- Confirmed matches: ${confirmedMatches.length}\n-- Unmatched columns preserved: ${Array.from(comprehensiveUnmatched.values()).reduce((sum, set) => sum + set.size, 0)}\n`;

  const sql = `-- Generated Snowflake SQL for Table Union
-- Note: Replace placeholder table names with your actual Snowflake table names.${verificationSection}${typeWarningSection}

${unionParts.join('\n\nUNION ALL\n\n')};
`;

  downloadFile(sql, 'union_query.sql', 'application/sql');
}


/**
 * Generates a JSON snapshot of the current matching state.
 */
export function generateJson(
    matches: Match[],
    unmatchedColumns: Map<string, string[]>
): void {
    const totalColumns = matches.flatMap(m => m.columns).length + Array.from(unmatchedColumns.values()).reduce((sum, cols) => sum + cols.length, 0);

    const jsonObject = {
        exportDate: new Date().toISOString(),
        summary: {
            matchCount: matches.length,
            unmatchedColumnCount: Array.from(unmatchedColumns.values()).reduce((sum, cols) => sum + cols.length, 0),
            totalColumns: totalColumns,
        },
        matches: matches.map(({ id, programmaticConfidence, aiConfidence, ...rest }) => rest), // Omit internal IDs and scores
        unmatchedColumns: Object.fromEntries(unmatchedColumns),
    };

    const jsonString = JSON.stringify(jsonObject, null, 2);
    downloadFile(jsonString, 'matching_state.json', 'application/json');
}

/**
 * Helper to find the full ColumnData object for a given column reference.
 */
function getColumnDataObject(fileName: string, colName: string, files: UploadedFile[]): ColumnData | undefined {
    const file = files.find(f => f.name === fileName);
    return file?.columns.find(c => c.originalName === colName);
}

/**
 * Generates a visual HTML report of the data union plan.
 */
export function generateHtmlReport(
  matches: Match[],
  unmatchedColumns: Map<string, string[]>,
  files: UploadedFile[],
): void {
  const confirmedMatches = matches.filter(m => m.status === MatchStatus.CONFIRMED);
  
  // This logic must be identical to generateSql to ensure consistency.
  const comprehensiveUnmatched = new Map<string, Set<string>>();
  unmatchedColumns.forEach((cols, file) => comprehensiveUnmatched.set(file, new Set(cols)));
  
  matches.filter(m => m.status !== MatchStatus.CONFIRMED).forEach(m => {
      (m.columns || []).forEach(col => {
          if (!comprehensiveUnmatched.has(col.fileName)) {
              comprehensiveUnmatched.set(col.fileName, new Set());
          }
          comprehensiveUnmatched.get(col.fileName)!.add(col.columnName);
      });
  });

  const unmatchedCount = Array.from(comprehensiveUnmatched.values()).reduce((sum, set) => sum + set.size, 0);

  const getSampleDataHtml = (data?: any[]) => {
      if (!data || data.length === 0) {
          return '<tr><td class="no-data">No sample data</td></tr>';
      }
      return data.slice(0, 5).map(d => `<tr><td>${d === null || d === undefined ? '<em>null</em>' : String(d)}</td></tr>`).join('');
  };

  const matchedHtml = confirmedMatches.length > 0 ? confirmedMatches.map(match => {
    const hasTypeMismatch = needsTypeConversion(match, files);
    const typeWarning = hasTypeMismatch ? '<span class="type-warning">⚠️ TYPE MISMATCH - Will be converted to VARCHAR in SQL</span>' : '';

    return `
      <div class="final-column-card ${hasTypeMismatch ? 'type-mismatch' : ''}">
        <h3>Final Unioned Column: <span>${match.finalName}</span> ${typeWarning}</h3>
        <div class="source-columns-container">
          ${(match.columns || []).map(col => {
            const colData = getColumnDataObject(col.fileName, col.columnName, files);
            const dataType = colData?.dataType || 'unknown';
            return `
              <div class="source-column-card">
                <h4>${col.fileName} &rarr; <strong>${col.columnName}</strong></h4>
                <p class="data-type">Data Type: <strong>${dataType}</strong></p>
                <table>
                  <thead><tr><th>Sample Data</th></tr></thead>
                  <tbody>${getSampleDataHtml(colData?.sampleData)}</tbody>
                </table>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('') : '<p class="info-text">No columns were confirmed for unioning.</p>';

  const unmatchedHtml = unmatchedCount > 0 ? Array.from(comprehensiveUnmatched.entries()).map(([fileName, columns]) => {
      if (columns.size === 0) return '';
      return `
        <div class="unmatched-file-group">
            <h3>File: ${fileName}</h3>
            <div class="source-columns-container">
                ${Array.from(columns).map(colName => {
                    const colData = getColumnDataObject(fileName, colName, files);
                    const dataType = colData?.dataType || 'unknown';
                    return `
                        <div class="source-column-card unmatched">
                            <h4><strong>${colName}</strong></h4>
                            <p class="data-type">Data Type: <strong>${dataType}</strong></p>
                            <table>
                                <thead><tr><th>Sample Data</th></tr></thead>
                                <tbody>${getSampleDataHtml(colData?.sampleData)}</tbody>
                            </table>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
      `;
  }).join('') : '<p class="info-text">All columns were successfully mapped for unioning.</p>';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Data Union Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; margin: 0; padding: 0; }
        header { background-color: #343a40; color: white; padding: 20px 40px; text-align: center; }
        header h1 { margin: 0; font-size: 2em; }
        header p { margin: 5px 0 0; color: #ced4da; }
        main { padding: 20px 40px; max-width: 1200px; margin: auto; }
        h2 { font-size: 1.8em; color: #495057; border-bottom: 2px solid #dee2e6; padding-bottom: 10px; margin-top: 40px; }
        h3 { font-size: 1.4em; color: #343a40; margin-bottom: 15px; }
        h3 span { background-color: #e9ecef; padding: 4px 8px; border-radius: 4px; font-family: "Courier New", monospace; font-weight: bold; }
        h4 { margin: 0 0 10px 0; font-size: 1.1em; color: #495057; word-break: break-all; }
        h4 strong { color: #000; }
        .final-column-card { background: #ffffff; border: 1px solid #dee2e6; border-left: 6px solid #28a745; margin-bottom: 25px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .final-column-card.type-mismatch { border-left-color: #ffc107; background-color: #fffbf0; }
        .type-warning { display: inline-block; margin-left: 10px; padding: 4px 8px; background-color: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 4px; font-size: 0.75em; font-weight: bold; }
        .data-type { margin: 5px 0 10px; font-size: 0.9em; color: #6c757d; }
        .data-type strong { color: #495057; font-family: "Courier New", monospace; background-color: #f8f9fa; padding: 2px 6px; border-radius: 3px; }
        .unmatched-file-group { margin-bottom: 25px; }
        .source-columns-container { display: flex; flex-wrap: wrap; gap: 20px; }
        .source-column-card { border: 1px solid #ced4da; border-radius: 6px; padding: 15px; background: #f8f9fa; flex: 1 1 250px; min-width: 250px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .source-column-card.unmatched { border-left: 6px solid #6c757d; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #e9ecef; padding: 8px; text-align: left; font-size: 0.9em; word-break: break-all; }
        th { background-color: #e9ecef; font-weight: 600; }
        td { background-color: #fff; }
        .no-data, em { color: #adb5bd; font-style: italic; }
        .summary-card { background-color: #e9ecef; padding: 20px; border-radius: 8px; display: flex; flex-wrap: wrap; justify-content: space-around; text-align: center; margin-bottom: 30px; gap: 15px; }
        .summary-item { font-size: 1.2em; }
        .summary-item strong { display: block; font-size: 2em; color: #007bff; }
        .info-text { color: #6c757d; font-size: 1.1em; text-align: center; padding: 20px; background: #f1f3f5; border-radius: 6px; }
      </style>
    </head>
    <body>
      <header>
        <h1>Data Union Report</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
      </header>
      <main>
        <div class="summary-card">
          <div class="summary-item"><strong>${files.length}</strong> Files Processed</div>
          <div class="summary-item"><strong>${confirmedMatches.length}</strong> Unioned Columns</div>
          <div class="summary-item"><strong>${unmatchedCount}</strong> Unmatched Columns</div>
        </div>
        
        <section id="matched-columns">
          <h2>Unioned Columns (${confirmedMatches.length})</h2>
          ${matchedHtml}
        </section>
        
        <section id="unmatched-columns">
          <h2>Unmatched Columns (${unmatchedCount})</h2>
          ${unmatchedHtml}
        </section>
      </main>
    </body>
    </html>
  `;

  downloadFile(htmlContent, 'union_report.html', 'text/html');
}