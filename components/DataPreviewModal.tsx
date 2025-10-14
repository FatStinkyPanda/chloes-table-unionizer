import React, { useMemo, useState, useEffect } from 'react';
import type { ColumnData } from '../types';
import { XCircleIcon } from './Icons';

// Search icon
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnData[];
}

export const DataPreviewModal: React.FC<DataPreviewModalProps> = ({ isOpen, onClose, columns }) => {
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [clickedValue, setClickedValue] = useState<string | null>(null);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});

  // Clear search state when modal opens or columns change
  useEffect(() => {
    if (isOpen) {
      setSearchQueries({});
      setClickedValue(null);
      setMatchCounts({});
    }
  }, [isOpen, columns]);

  const maxRows = useMemo(() => {
    if (!columns || columns.length === 0) return 0;
    return Math.max(0, ...columns.map(c => c.sampleData.length));
  }, [columns]);

  const getFilteredRows = useMemo(() => {
    if (!columns || columns.length === 0) return [];
    if (Object.keys(searchQueries).length === 0 || Object.values(searchQueries).every(q => !q)) {
      return Array.from({ length: maxRows }).map((_, i) => i);
    }

    // Return rows that match at least one search query
    const matchingRows = new Set<number>();
    Object.entries(searchQueries).forEach(([colKey, query]) => {
      if (!query) return;
      const col = columns.find(c => `${c.fileId}-${c.originalName}` === colKey);
      if (!col) return;

      col.sampleData.forEach((data, index) => {
        if (String(data).toLowerCase().includes(query.toLowerCase())) {
          matchingRows.add(index);
        }
      });
    });

    return Array.from(matchingRows).sort((a, b) => a - b);
  }, [searchQueries, maxRows, columns]);

  if (!isOpen || !columns || columns.length === 0) {
    return null;
  }

  const handleCellClick = (value: any) => {
    if (value === null || value === undefined || value === '') return;

    const searchValue = String(value);
    setClickedValue(searchValue);

    // Count matches across all columns
    const counts: Record<string, number> = {};
    columns.forEach(col => {
      const colKey = `${col.fileId}-${col.originalName}`;
      counts[colKey] = col.sampleData.filter(data => String(data) === searchValue).length;
    });
    setMatchCounts(counts);
  };

  const clearSearch = () => {
    setClickedValue(null);
    setMatchCounts({});
  };

  const handleSearchChange = (colKey: string, value: string) => {
    setSearchQueries(prev => ({
      ...prev,
      [colKey]: value
    }));
    // Clear click search when typing
    if (clickedValue) {
      clearSearch();
    }
  };

  const getCellHighlight = (col: ColumnData, value: any, rowIndex: number): string => {
    const colKey = `${col.fileId}-${col.originalName}`;
    const stringValue = String(value);
    const searchQuery = searchQueries[colKey]?.toLowerCase() || '';

    // Highlight if matches clicked value
    if (clickedValue && stringValue === clickedValue) {
      return 'bg-yellow-200 border-2 border-yellow-400 font-semibold';
    }

    // Highlight if matches search query
    if (searchQuery && stringValue.toLowerCase().includes(searchQuery)) {
      return 'bg-blue-100 border border-blue-300';
    }

    return '';
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Column Data Preview & Search</h2>
            <p className="text-sm text-gray-600 mt-1">Click any cell to find matches across columns, or use search boxes to filter</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <XCircleIcon className="w-8 h-8" />
          </button>
        </div>

        {/* Active search indicator */}
        {clickedValue && (
          <div className="p-3 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-yellow-900">
                Searching for: <span className="font-mono bg-yellow-100 px-2 py-1 rounded">{clickedValue}</span>
              </span>
              <div className="flex gap-3 text-xs">
                {columns.map(col => {
                  const colKey = `${col.fileId}-${col.originalName}`;
                  const count = matchCounts[colKey] || 0;
                  return (
                    <span key={colKey} className={`px-2 py-1 rounded ${count > 0 ? 'bg-green-100 text-green-800 font-semibold' : 'bg-gray-100 text-gray-600'}`}>
                      {col.originalName}: {count} match{count !== 1 ? 'es' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              onClick={clearSearch}
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-md font-semibold"
            >
              Clear
            </button>
          </div>
        )}

        <div className="p-4 overflow-auto flex-grow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10 w-12">#</th>
                  {columns.map(col => {
                    const colKey = `${col.fileId}-${col.originalName}`;
                    return (
                      <th key={colKey} className="px-4 py-3 text-left sticky top-0 bg-gray-50 z-10 min-w-[200px]">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-blue-600 font-semibold">{col.fileName}</span>
                            <span className="text-sm text-gray-800 font-semibold">{col.originalName}</span>
                          </div>
                          <div className="relative">
                            <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={searchQueries[colKey] || ''}
                              onChange={(e) => handleSearchChange(colKey, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full pl-8 pr-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {getFilteredRows.map((rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-500 bg-gray-50 sticky left-0">{rowIndex + 1}</td>
                    {columns.map(col => {
                      const value = col.sampleData[rowIndex];
                      const displayValue = value ?? <span className="text-gray-400 italic">null</span>;
                      const highlightClass = getCellHighlight(col, value, rowIndex);

                      return (
                        <td
                          key={`${col.fileId}-${col.originalName}-${rowIndex}`}
                          className={`px-4 py-2 whitespace-nowrap text-sm text-gray-800 cursor-pointer transition-colors ${highlightClass} hover:bg-gray-100`}
                          onClick={() => handleCellClick(value)}
                          title="Click to search for this value across all columns"
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {getFilteredRows.length === 0 && (
                    <tr>
                        <td colSpan={columns.length + 1} className="text-center py-8 text-gray-500">
                            {Object.values(searchQueries).some(q => q)
                              ? "No matching rows found."
                              : "No sample data available for these columns."}
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {getFilteredRows.length > 0 && Object.values(searchQueries).some(q => q) && (
                <span>Showing {getFilteredRows.length} of {maxRows} rows</span>
              )}
              {clickedValue && (
                <span className="ml-4 text-yellow-700 font-semibold">
                  💡 Yellow highlighted cells match your clicked value
                </span>
              )}
            </div>
            <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
