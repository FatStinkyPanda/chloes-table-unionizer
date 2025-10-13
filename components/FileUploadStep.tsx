import React, { useState, useCallback } from 'react';
import { UploadIcon } from './Icons';

interface FileUploadStepProps {
  onFilesSelected: (files: File[]) => void;
  onFilesSelectedWithoutMatching: (files: File[]) => void;
}

export const FileUploadStep: React.FC<FileUploadStepProps> = ({ onFilesSelected, onFilesSelectedWithoutMatching }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      setSelectedFiles(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files && files.length > 0) {
      setSelectedFiles(files);
    }
  };

  const handleSubmit = () => {
    if (selectedFiles.length >= 2) {
      onFilesSelected(selectedFiles);
    } else {
      alert("Please select at least two files to compare.");
    }
  };

  const handleStartFresh = () => {
    if (selectedFiles.length >= 2) {
      onFilesSelectedWithoutMatching(selectedFiles);
    } else {
      alert("Please select at least two files to compare.");
    }
  };


  return (
    <div className="bg-white p-8 rounded-lg shadow-lg text-center">
      <h2 className="text-2xl font-semibold mb-4">Upload Your Data Files</h2>
      <p className="text-gray-600 mb-6">Select two or more Excel (.xlsx, .xls) or CSV (.csv) files to begin.</p>
      
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 transition-colors duration-200 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          className="hidden"
          onChange={handleFileChange}
        />
        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
          <UploadIcon className="w-12 h-12 text-gray-400" />
          <p className="mt-2 text-gray-600">
            <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">Excel (XLS, XLSX) or CSV files</p>
        </label>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-6 text-left">
          <h3 className="font-semibold text-lg">Selected Files:</h3>
          <ul className="list-disc list-inside mt-2 bg-gray-100 p-4 rounded-md">
            {selectedFiles.map((file, index) => (
              <li key={index} className="text-gray-700">{file.name}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={handleStartFresh}
          disabled={selectedFiles.length < 2}
          className="w-full bg-gray-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-300"
        >
          Start with these files
        </button>
        <button
          onClick={handleSubmit}
          disabled={selectedFiles.length < 2}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-300"
        >
          Analyze & Find Matches
        </button>
      </div>
    </div>
  );
};
