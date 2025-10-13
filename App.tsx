import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FileUploadStep } from './components/FileUploadStep';
import { MatchingStep } from './components/MatchingStep';
import { ResultsStep } from './components/ResultsStep';
import { parseFiles } from './services/parserService';
import { generateMatches } from './services/matchingService';
import type { UploadedFile, Match } from './types';
import { AppState } from './types';
import { LoadingIcon } from './components/Icons';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [unmatchedColumns, setUnmatchedColumns] = useState<Map<string, string[]>>(new Map());

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length < 2) {
      alert("Please select at least two files.");
      return;
    }
    setAppState(AppState.PROCESSING);
    try {
      const { uploadedFiles, alignmentResult } = await parseFiles(selectedFiles);

      // Display alignment result to user
      if (alignmentResult.success) {
        alert(`Row Alignment Success:\n${alignmentResult.message}`);
      } else {
        alert(`Row Alignment Notice:\n${alignmentResult.message}`);
      }

      setFiles(uploadedFiles);
      
      const { matches: newMatches, unmatched } = generateMatches(uploadedFiles);
      setMatches(newMatches);

      const unmatchedMap = new Map<string, string[]>();
      uploadedFiles.forEach(file => {
          const fileUnmatched = unmatched.filter(c => c.fileId === file.id).map(c => c.originalName);
          if (fileUnmatched.length > 0) {
              unmatchedMap.set(file.name, fileUnmatched);
          }
      });
      setUnmatchedColumns(unmatchedMap);
      
      setAppState(AppState.MATCHING);
    } catch (error) {
      console.error("Error processing files:", error);
      alert("An error occurred while processing the files. Please check the console.");
      setAppState(AppState.UPLOAD);
    }
  }, []);

  const handleFilesSelectedWithoutMatching = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length < 2) {
      alert("Please select at least two files.");
      return;
    }
    setAppState(AppState.PROCESSING);
    try {
      const { uploadedFiles, alignmentResult } = await parseFiles(selectedFiles);

      // Display alignment result to user
      if (alignmentResult.success) {
        alert(`Row Alignment Success:\n${alignmentResult.message}`);
      } else {
        alert(`Row Alignment Notice:\n${alignmentResult.message}`);
      }

      setFiles(uploadedFiles);
      setMatches([]); // Start with no matches

      // All columns are unmatched
      const unmatchedMap = new Map<string, string[]>();
      uploadedFiles.forEach(file => {
        const fileUnmatched = file.columns.map(c => c.originalName);
        if (fileUnmatched.length > 0) {
          unmatchedMap.set(file.name, fileUnmatched);
        }
      });
      setUnmatchedColumns(unmatchedMap);
      
      setAppState(AppState.MATCHING);
    } catch (error) {
      console.error("Error processing files:", error);
      alert("An error occurred while processing the files. Please check the console.");
      setAppState(AppState.UPLOAD);
    }
  }, []);

  const handleReset = () => {
    setFiles([]);
    setMatches([]);
    setUnmatchedColumns(new Map());
    setAppState(AppState.UPLOAD);
  };

  const renderContent = () => {
    switch (appState) {
      case AppState.UPLOAD:
        return <FileUploadStep onFilesSelected={handleFilesSelected} onFilesSelectedWithoutMatching={handleFilesSelectedWithoutMatching} />;
      case AppState.PROCESSING:
        return (
          <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-lg">
            <LoadingIcon className="w-16 h-16 text-blue-600" />
            <p className="mt-4 text-xl font-semibold text-gray-700">Analyzing files and finding matches...</p>
            <p className="text-gray-500">This may take a moment for large files.</p>
          </div>
        );
      case AppState.MATCHING:
        return <MatchingStep initialMatches={matches} unmatchedColumns={unmatchedColumns} files={files} onProceed={(finalMatches) => {
          setMatches(finalMatches);
          setAppState(AppState.RESULTS);
        }} />;
      case AppState.RESULTS:
        return <ResultsStep matches={matches} files={files} onReset={handleReset} />;
      default:
        return <FileUploadStep onFilesSelected={handleFilesSelected} onFilesSelectedWithoutMatching={handleFilesSelectedWithoutMatching} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export default App;
