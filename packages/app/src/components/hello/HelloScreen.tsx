import React, { useState, useRef, DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './HelloScreen.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

interface HelloScreenProps {
  onImageReady: (base64: string) => void;
}

export default function HelloScreen({ onImageReady }: HelloScreenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // For focus management

  // --- Handlers ---

  const processFiles = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      console.warn('Invalid file type:', file.type);
      return;
    }
    if (file.size > MAX_SIZE) {
      console.warn('File too large');
      return;
    }

    try {
        let resultBase64 = "";
        
        // @ts-ignore - Check for path (Tauri specific)
        if (file.path) {
             // @ts-ignore
             resultBase64 = await invoke('process_image_path', { path: file.path });
        } else {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            resultBase64 = await invoke('process_image_bytes', { bytes: Array.from(bytes) });
        }
        
        // Success! Notify parent to switch screens
        onImageReady(resultBase64);
        
    } catch (error) {
        console.error("Failed to process file", error);
    }
  };

  // --- Event Listeners ---

  const handleDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) processFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files?.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length > 0) processFiles(e.target.files);
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerFileInput();
    }
  };

  return (
    <div 
      className="container" 
      onPaste={handlePaste} // Add Paste Listener to main container
      tabIndex={-1} // Allow container to capture focus for paste
    >
      <input
        ref={fileInputRef}
        className="fileInput"
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileInputChange}
      />

      <section
        className={`uploadArea ${isDragging ? 'dragging' : ''}`}
        tabIndex={0}
        role="button"
        onClick={triggerFileInput}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <svg className="uploadSvg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"></path>
          <polyline points="7 11 12 6 17 11"></polyline>
          <line x1="12" y1="6" x2="12" y2="18"></line>
        </svg>
        <div className="title">Upload your image</div>
        <div className="subtitle">Click, drop, or paste (Ctrl+V) a file</div>
        <div className="hint" aria-hidden="true">
          <span>• JPG, PNG, WEBP</span>
          <span>• Max 20 MB</span>
        </div>
      </section>

      {/* ... Right Column remains same ... */}
       <aside className="rightCol" aria-label="Details">
        <div className="panelTitle">Quick notes</div>
        <div className="panelBody">
          Files are processed immediately. There is no preview.
        </div>
        <div style={{ height: '8px' }}></div>
        <div className="panelTitle">Accessibility</div>
        <div className="panelBody">
          You can tab to the upload area and press Enter to open the file
          dialog.
        </div>

        <div className="footer" aria-hidden="true">
          <p className="footerText">
            Spatialshot &copy; 2025
          </p>
        </div>
      </aside>
    </div>
  );
}