import React from 'react';

interface ProcessingModalProps {
  progress: number;
  total: number;
  message?: string;
}

export const ProcessingModal: React.FC<ProcessingModalProps> = ({ progress, total, message }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="text-center p-8 max-w-sm w-full">
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
          <div 
            className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"
          ></div>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Processando...</h2>
        <p className="text-slate-400 mb-4 text-sm animate-pulse">{message || `Criando variações...`}</p>
        
        {total > 0 && (
            <>
                <div className="mt-4 bg-slate-800 rounded-full h-2 w-full mx-auto overflow-hidden">
                <div 
                    className="h-full bg-blue-500 transition-all duration-300" 
                    style={{ width: `${(progress / total) * 100}%` }}
                ></div>
                </div>
                <p className="mt-2 text-sm text-blue-400 font-mono">{(progress / total * 100).toFixed(0)}%</p>
            </>
        )}
      </div>
    </div>
  );
};
