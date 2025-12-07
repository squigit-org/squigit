import React from 'react';
import { StepLayout } from '../StepLayout';
import { LICENSE_TEXT } from '../../constants';
import { ScrollText } from 'lucide-react';

interface Props {
  isAgreed: boolean;
  setIsAgreed: (val: boolean) => void;
  onNext: () => void;
  onCancel: () => void;
}

export const Welcome: React.FC<Props> = ({ isAgreed, setIsAgreed, onNext, onCancel }) => {
  return (
    <StepLayout
      title="License Agreement"
      description="Please read the following important information before continuing."
      icon={<ScrollText size={24} />}
      onNext={onNext}
      onCancel={onCancel}
      disableNext={!isAgreed}
    >
      <style>{`
        .radio-option {
            display: flex;
            align-items: center;
            margin: 8px 0;
            cursor: pointer;
            font-size: 13px;
        }

        .radio-option input[type="radio"] {
            margin-right: 8px;
            cursor: pointer;
        }
      `}</style>
      <div className="flex flex-col h-full space-y-3">
        <div className="text-sm text-gray-700 shrink-0">
          Please read the following License Agreement. You must accept the terms of this agreement before continuing.
        </div>
        
        {/* CHANGED: flex-1 ensures it fills available space. min-h-0 allows scrollbar. */}
        <div className="flex-1 min-h-0 border border-gray-300 bg-white p-3 eula-scroll font-mono text-xs leading-relaxed text-gray-600 select-text shadow-inner overflow-y-auto">
          <pre className="whitespace-pre-wrap font-sans">{LICENSE_TEXT}</pre>
        </div>

        <div className="radio-group pt-1 shrink-0">
            <label className="radio-option">
                <input 
                    type="radio" 
                    name="agreement" 
                    value="accept" 
                    checked={isAgreed}
                    onChange={() => setIsAgreed(true)}
                />
                <span>I accept the agreement</span>
            </label>
            <label className="radio-option">
                <input 
                    type="radio" 
                    name="agreement" 
                    value="decline"
                    checked={!isAgreed}
                    onChange={() => setIsAgreed(false)}
                />
                <span>I do not accept the agreement</span>
            </label>
        </div>
      </div>
    </StepLayout>
  );
};