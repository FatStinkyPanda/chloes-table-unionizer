
import React from 'react';
import { TableIcon } from './Icons';

export const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-md">
      <div className="container mx-auto px-4 py-4 flex items-center">
        <TableIcon className="w-10 h-10 text-blue-600 mr-3" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Chloe's Table Unionizer</h1>
          <p className="text-sm text-gray-500">Intelligent Data Union Assistant</p>
        </div>
      </div>
    </header>
  );
};
