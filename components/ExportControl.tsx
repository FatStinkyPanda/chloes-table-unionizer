import React, { useState } from 'react';
import type { Match, UploadedFile } from '../types';
import { generateSql, generateJson, generateHtmlReport } from '../services/exportService';
import { DownloadIcon, DocumentTextIcon } from './Icons';

interface ExportControlProps {
  matches: Match[];
  unmatchedColumns: Map<string, string[]>;
  files: UploadedFile[];
}

export const ExportControl: React.FC<ExportControlProps> = ({ matches, unmatchedColumns, files }) => {
  const [includeSource, setIncludeSource] = useState(true);
  const [sourceColumnName, setSourceColumnName] = useState('SOURCE_FILE_NAME');

  const handleExportSql = () => {
    generateSql(matches, unmatchedColumns, files, { 
      includeSource, 
      sourceColumnName 
    });
  };

  const handleExportJson = () => {
    generateJson(matches, unmatchedColumns);
  };

  const handleExportReport = () => {
    generateHtmlReport(matches, unmatchedColumns, files);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <h3 className="text-xl font-semibold mb-4">Export Current State</h3>
      
      <div className="space-y-4">
        {/* Source Column Option */}
        <div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSource}
              onChange={(e) => setIncludeSource(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Include source file column in SQL</span>
          </label>
          {includeSource && (
            <input
              type="text"
              value={sourceColumnName}
              onChange={(e) => setSourceColumnName(e.target.value)}
              placeholder="Enter source column name"
              className="mt-2 block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          )}
        </div>
        
        {/* Export Buttons */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            onClick={handleExportSql}
            className="flex items-center justify-center py-2 px-4 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            title="Download Snowflake SQL for data union"
          >
            <DownloadIcon className="w-4 h-4 mr-2" />
            SQL
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center justify-center py-2 px-4 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            title="Download JSON of current match state"
          >
            <DownloadIcon className="w-4 h-4 mr-2" />
            JSON
          </button>
          <button
            onClick={handleExportReport}
            className="flex items-center justify-center py-2 px-4 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
            title="Download a visual HTML report of the union"
          >
            <DocumentTextIcon className="w-4 h-4 mr-2" />
            Report
          </button>
        </div>
      </div>
    </div>
  );
};