import React, { useMemo } from 'react';
import type { ColumnData } from '../types';
import { XCircleIcon } from './Icons';

interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnData[];
}

export const DataPreviewModal: React.FC<DataPreviewModalProps> = ({ isOpen, onClose, columns }) => {
  if (!isOpen || !columns || columns.length === 0) {
    return null;
  }

  const maxRows = useMemo(() => {
    return Math.max(0, ...columns.map(c => c.sampleData.length));
  }, [columns]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Column Data Preview</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <XCircleIcon className="w-8 h-8" />
          </button>
        </div>
        <div className="p-6 overflow-auto">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10 w-12">#</th>
                  {columns.map(col => (
                    <th key={`${col.fileId}-${col.originalName}`} className="px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky top-0 bg-gray-50 z-10">
                      <div className="flex flex-col">
                        <span className="text-blue-600">{col.fileName}</span>
                        <span className="text-gray-800">{col.originalName}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: maxRows }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-500 bg-gray-50 sticky left-0">{rowIndex + 1}</td>
                    {columns.map(col => (
                      <td key={`${col.fileId}-${col.originalName}-${rowIndex}`} className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">
                        {col.sampleData[rowIndex] ?? <span className="text-gray-400 italic">null</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {maxRows === 0 && (
                    <tr>
                        <td colSpan={columns.length + 1} className="text-center py-8 text-gray-500">
                            No sample data available for these columns.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 text-right">
            <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};