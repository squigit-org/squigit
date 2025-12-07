import React from 'react';
import { Button } from './Button';

interface StepLayoutProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onCancel?: () => void; // Optional, as installing step hides it
  nextLabel?: string;
  cancelLabel?: string;
  disableNext?: boolean;
  hideButtons?: boolean;
  isInstallAction?: boolean; // Changes Next button style
  isFinish?: boolean;
}

export const StepLayout: React.FC<StepLayoutProps> = ({
  title,
  description,
  icon,
  children,
  onNext,
  onBack,
  onCancel,
  nextLabel = "Next >",
  cancelLabel = "Cancel",
  disableNext = false,
  hideButtons = false,
  isInstallAction = false,
  isFinish = false,
}) => {
  return (
    <div className="flex flex-col h-full w-full">
      {/* HEADER SECTION */}
      <div className="flex bg-white p-5 border-b border-gray-200 select-none shrink-0">
        <div className="flex-1 pr-4">
          <h2 className="text-lg font-bold text-gray-900 mb-1 leading-none">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        {icon && <div className="text-gray-500 shrink-0">{icon}</div>}
      </div>

      {/* CONTENT SECTION - FLEXIBLE */}
      {/* flex-1: Fills remaining height. min-h-0: Allows nested scrollbars to work properly */}
      <div className="flex-1 min-h-0 p-5 bg-white overflow-hidden flex flex-col">
        {children}
      </div>

      {/* FOOTER SECTION - FIXED AT BOTTOM */}
      {!hideButtons && (
        <div className="bg-gray-50 border-t border-gray-300 p-3 flex justify-between items-center shrink-0 select-none z-10">
           {/* Left side (Branding or Version could go here) */}
           <div className="text-xs text-gray-400">
              Spatialshot
           </div>

           {/* Right side (Buttons) */}
           <div className="flex space-x-2">
             <Button onClick={onBack} disabled={!onBack || isFinish}>
               &lt; Back
             </Button>
             <Button 
               onClick={onNext} 
               disabled={disableNext}
               variant={isInstallAction ? 'primary' : 'secondary'}
             >
               {nextLabel}
             </Button>
             <Button onClick={onCancel} className="ml-2" disabled={!onCancel}>
               {cancelLabel}
             </Button>
           </div>
        </div>
      )}
    </div>
  );
};