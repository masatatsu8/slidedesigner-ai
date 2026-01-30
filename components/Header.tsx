
import React from 'react';

interface HeaderProps {
  isDriveConnected: boolean;
  driveFolderUrl: string;
  onConnectDrive: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isDriveConnected, driveFolderUrl, onConnectDrive, onOpenSettings }) => {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h1 className="ml-2 text-xl font-bold text-gray-900">InfographAI</h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* Drive Controls */}
            <div className="flex items-center space-x-2 mr-4 border-r pr-4 border-gray-200">
               <button
                 onClick={onConnectDrive}
                 disabled={isDriveConnected}
                 className={`text-xs font-medium px-3 py-1.5 rounded-md flex items-center transition-colors
                   ${isDriveConnected 
                     ? 'bg-green-100 text-green-700 cursor-default' 
                     : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'}`}
               >
                 {isDriveConnected ? (
                   <>
                     <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                     Drive連携済
                   </>
                 ) : (
                   <>
                     <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 1.984C12.33 1.984 12.63 2.154 12.79 2.434L21.46 17.434C21.62 17.714 21.62 18.064 21.46 18.334L18.68 23.164C18.52 23.444 18.21 23.614 17.89 23.614H3.88995C3.56995 23.614 3.26995 23.444 3.10995 23.164L0.329956 18.334C0.169956 18.054 0.169956 17.714 0.329956 17.434L4.85996 9.58402L8.25996 15.484H14.88L17.58 10.784H9.64996L6.55996 5.43402L11.23 2.434C11.39 2.154 11.69 1.984 12.01 1.984Z" /></svg>
                     Drive連携
                   </>
                 )}
               </button>
               
               <a 
                 href={driveFolderUrl} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center px-2 py-1"
               >
                 <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                 ファイル一覧
               </a>

               <button
                onClick={onOpenSettings}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors ml-2"
                title="設定"
               >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               </button>
            </div>

            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-200">
              Gemini 3 Pro Image
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
