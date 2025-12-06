import React from 'react';
import { StepLayout } from '../StepLayout';
import { CheckCircle } from 'lucide-react';

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

         <div className="mt-6 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-sm">
            <label className="flex items-center space-x-3 cursor-pointer select-none">
                <div className="relative flex items-center">
                    <input 
                    type="checkbox" 
                    checked={launchOnExit} 
                    onChange={(e) => setLaunchOnExit(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                </div>
                <span className="text-sm font-medium text-gray-900">Launch Spatialshot</span>
            </label>
         </div>
      </div>
    </StepLayout>
  );
};
