import React from 'react';
import { StepLayout } from '../StepLayout';
import { CheckCircle, Check } from 'lucide-react';

interface Props {
  launchOnExit: boolean;
  setLaunchOnExit: (val: boolean) => void;
  onFinish: () => void;
}

export const Finish: React.FC<Props> = ({ launchOnExit, setLaunchOnExit, onFinish }) => {
  return (
    <StepLayout
      title="Completing the Spatialshot Setup Wizard"
      description=""
      hideButtons={false}
      nextLabel="Finish"
      isFinish
      onNext={onFinish}
    >
      <div className="flex flex-col h-full">
         <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
            <CheckCircle size={64} className="text-green-600 mb-2" />
            
            <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-bold text-gray-900">Installation Complete</h3>
                <p className="text-sm text-gray-700">
                Setup has finished installing Spatialshot on your computer. The application may be launched by selecting the installed icons.
                </p>
                <p className="text-sm text-gray-700">
                Click Finish to exit Setup.
                </p>
            </div>
         </div>

         <div className="mt-6 mb-4 flex justify-center">
            <label className="flex items-center cursor-pointer select-none group">
                <div className="relative">
                    <input 
                        type="checkbox" 
                        checked={launchOnExit} 
                        onChange={(e) => setLaunchOnExit(e.target.checked)}
                        className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-200 ${
                        launchOnExit 
                            ? 'bg-blue-600 border-blue-600 shadow-sm' 
                            : 'bg-white border-gray-300 group-hover:border-blue-400'
                    }`}>
                        <Check size={14} className={`text-white transition-opacity duration-200 ${launchOnExit ? 'opacity-100' : 'opacity-0'}`} strokeWidth={3} />
                    </div>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                    Launch Spatialshot
                </span>
            </label>
         </div>
      </div>
    </StepLayout>
  );
};
