import React, { useState } from 'react';
import './LensButton.css';

const ipc = "ipc" in window ? (window as any).ipc : null;

interface LensButtonProps {
  isChatMode: boolean;
}

const LensButton: React.FC<LensButtonProps> = ({ isChatMode }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLensPress = async () => {
    if (ipc && !isLoading) {
      setIsLoading(true);
      try {
        await ipc.triggerLensSearch();
      } catch (error) {
        console.error("Error during Lens search:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      console.log("IPC not available or already loading");
    }
  };

  const spinner = (
    <svg viewBox="0 0 24 24" fill="none" className="spinner">
      <style>{`
        .spinner {
          animation: spin 1s linear infinite;
          transform-origin: center;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.415, 31.415" strokeDashoffset="15.7075"></circle>
    </svg>
  );

  const cameraIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
      <circle cx="12" cy="13" r="3"></circle>
    </svg>
  );

  return (
    <button className={`lens-btn ${isChatMode ? 'chat-mode' : ''}`} onClick={handleLensPress} disabled={isLoading}>
      <span className="btn-border"></span>
      
      {isLoading ? spinner : cameraIcon}

      <div className="reel-window">
        <div className="reel-strip">
          <span>Use Google Lens</span>
          <span>Copy Text</span>
          <span>Translate</span>
          <span>Image Search</span>
          <span>QR Codes</span>
          {/* Clone of the first item for seamless loop */}
          <span>Use Google Lens</span>
        </div>
      </div>
    </button>
  );
};

export default LensButton;
