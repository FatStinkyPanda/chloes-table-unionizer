import React from 'react';
import type { UploadedFile } from '../types';

interface SourceFilesControlProps {
  files: UploadedFile[];
  onColorChange: (fileId: string, color: string) => void;
}

const PASTEL_COLORS = [
    '#A7C7E7', // Blue
    '#F8C8DC', // Pink
    '#B2F2BB', // Green
    '#FFF2B2', // Yellow
    '#D8B4E2', // Purple
];

export const SourceFilesControl: React.FC<SourceFilesControlProps> = ({ files, onColorChange }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <h3 className="text-xl font-semibold mb-4">Source Files</h3>
      <ul className="space-y-4">
        {files.map(file => (
          <li key={file.id} className="border-t pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between">
                <div className="flex items-baseline min-w-0">
                    <span className="font-bold text-gray-500 mr-2">[{file.sourceId}]</span>
                    <p className="font-semibold text-gray-800 truncate" title={file.name}>
                        {file.name}
                    </p>
                </div>
                 <div className="relative w-8 h-8">
                    <input
                        type="color"
                        value={file.color}
                        onChange={(e) => onColorChange(file.id, e.target.value)}
                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                        title="Select custom color"
                    />
                    <div className="w-8 h-8 rounded-full border-2 border-gray-200" style={{ backgroundColor: file.color }}></div>
                </div>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              {PASTEL_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => onColorChange(file.id, color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform duration-150 ${file.color.toLowerCase() === color.toLowerCase() ? 'border-blue-500 scale-110' : 'border-white hover:scale-110'}`}
                  style={{ backgroundColor: color }}
                  title={`Set color to ${color}`}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};