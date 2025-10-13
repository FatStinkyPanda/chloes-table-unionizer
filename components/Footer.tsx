import React from 'react';
import { HeartIcon } from './Icons';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white mt-auto">
      <div className="container mx-auto px-4 py-3 text-center text-sm">
        <p>Designed and developed by Daniel A Bissey (FatStinkyPanda)</p>
        <p>Contact: <a href="mailto:support@fatstinkypanda.com" className="text-blue-400 hover:underline">support@fatstinkypanda.com</a></p>
        <div className="mt-2 text-gray-400 flex items-center justify-center space-x-1.5">
            <HeartIcon className="w-4 h-4 text-pink-500 flex-shrink-0" />
            <p>
                If this tool has made your life a little easier, please consider supporting its development via 
                <a href="https://venmo.com/u/FatStinkyPanda" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-semibold ml-1">
                    Venmo @FatStinkyPanda
                </a>.
            </p>
        </div>
      </div>
    </footer>
  );
};
