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
  hideHeader?: boolean;
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
  nextLabel = "Next",
  cancelLabel = "Cancel",
  disableNext = false,
  hideButtons = false,
  hideHeader = false,
  isInstallAction = false,
  isFinish = false,
}) => {
  return (
    <div className="flex flex-col h-full w-full">
      {/* HEADER SECTION */}
      {!hideHeader && (
        <div className="flex items-center bg-white p-5 border-b border-gray-200 select-none shrink-0">
          {icon && <div className="text-gray-500 shrink-0 mr-4">{icon}</div>}
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 mb-1 leading-none">{title}</h2>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
      )}

      {/* CONTENT SECTION - FLEXIBLE */}
      {/* flex-1: Fills remaining height. min-h-0: Allows nested scrollbars to work properly */}
      <div className="flex-1 min-h-0 p-5 bg-white overflow-hidden flex flex-col">
        {children}
      </div>

      {/* FOOTER SECTION - FIXED AT BOTTOM */}
      {!hideButtons && (
        <div className="bg-gray-50 border-t border-gray-300 p-3 flex justify-end items-center shrink-0 select-none z-10">
           {/* Right side (Buttons) */}
           <div className="flex space-x-2">
             {onBack && !isFinish && (
               <Button onClick={onBack}>
                 Back
               </Button>
             )}
             <Button 
               onClick={onNext} 
               disabled={disableNext}
               variant={isInstallAction ? 'primary' : 'secondary'}
             >
               {nextLabel}
             </Button>
             {onCancel && (
               <Button onClick={onCancel} className="ml-2">
                 {cancelLabel}
               </Button>
             )}
           </div>
        </div>
      )}
    </div>
  );
};