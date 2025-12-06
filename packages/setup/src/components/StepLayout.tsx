import React from 'react';
import { Button } from './Button';

interface StepLayoutProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onCancel?: () => void;
  nextLabel?: string;
  backLabel?: string;
  cancelLabel?: string;
  disableNext?: boolean;
  hideButtons?: boolean;
  isInstallAction?: boolean; // Changes Next button style to primary/install
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
  nextLabel = 'Next',
  backLabel = 'Back',
  cancelLabel = 'Cancel',
  disableNext = false,
  hideButtons = false,
  isInstallAction = false,
  isFinish = false,
}) => {
  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {/* Header Area */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white select-none">
        <div className="flex items-start space-x-4">
          {icon && <div className="mt-1 text-gray-500">{icon}</div>}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">{title}</h2>
            {description && <p className="text-gray-500 text-xs mt-1">{description}</p>}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto bg-gray-50/30">
        {children}
      </div>

      {/* Footer / Button Bar */}
      {!hideButtons && (
        <div className="px-5 py-3 bg-gray-100 border-t border-gray-300 flex justify-between items-center select-none">
          {/* Left Side: Cancel */}
          <div>
            {onCancel && (
              <Button variant="secondary" onClick={onCancel}>
                {cancelLabel}
              </Button>
            )}
          </div>

          {/* Right Side: Back & Next */}
          <div className="flex space-x-3">
            {onBack && (
              <Button variant="secondary" onClick={onBack}>
                {backLabel}
              </Button>
            )}
            
            {onNext && (
              <Button 
                variant={isInstallAction || isFinish ? 'primary' : 'secondary'} 
                onClick={onNext}
                disabled={disableNext}
              >
                {nextLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};