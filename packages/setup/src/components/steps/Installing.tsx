import React, { useEffect, useState, useRef } from 'react';
import { StepLayout } from '../StepLayout';
import { HardDrive } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

export const Installing: React.FC<Props> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing setup...');
  // Use a ref to track if complete has been called to prevent double calls in strict mode
  const completedRef = useRef(false);

  useEffect(() => {
    let interval: number;
    
    // Simple state machine for the fake progress
    const runProgress = () => {
      setProgress((prev) => {
        if (prev >= 100) {
            return 100;
        }

        // Variable speed
        let increment = Math.random() * 2;
        if (prev < 20) increment = 0.5; // Slow start
        else if (prev > 80) increment = 0.3; // Slow end

        const next = Math.min(prev + increment, 100);
        
        // Update status text based on progress
        if (next < 10) setStatus('Creating directories...');
        else if (next < 30) setStatus('Downloading daemon-win-x64.zip...');
        else if (next < 50) setStatus('Extracting capture-win-x64.zip...');
        else if (next < 80) setStatus('Installing spatialshot-win-x64.zip...');
        else if (next < 95) setStatus('Registering components...');
        else setStatus('Finalizing installation...');

        return next;
      });
    };

    interval = window.setInterval(runProgress, 50);

    return () => clearInterval(interval);
  }, []);

  // Separate effect to handle completion
  useEffect(() => {
    if (progress >= 100 && !completedRef.current) {
        completedRef.current = true;
        const timer = setTimeout(onComplete, 800);
        return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  return (
    <StepLayout
      title="Installing"
      description="Please wait while Setup installs Spatialshot on your computer."
      icon={<HardDrive size={24} className="animate-pulse" />}
      hideButtons={true}
    >
      <div className="flex flex-col justify-center h-full space-y-6">
        <div className="space-y-1">
             <div className="flex justify-between text-xs text-gray-600 mb-1">
                 <span>{status}</span>
                 <span>{Math.floor(progress)}%</span>
             </div>
             
             {/* Progress Bar Container */}
             <div className="h-5 w-full bg-gray-200 border border-gray-300 rounded-sm relative overflow-hidden">
                {/* Progress Fill */}
                <div 
                    className="h-full bg-blue-600 transition-all duration-100 ease-out relative"
                    style={{ width: `${progress}%` }}
                >
                    {/* Gloss effect on bar */}
                    <div className="absolute top-0 left-0 right-0 h-[50%] bg-white opacity-20"></div>
                </div>
                {/* Stripe pattern overlay */}
                <div className="absolute inset-0 opacity-10" 
                     style={{
                         backgroundImage: 'linear-gradient(45deg,rgba(0,0,0,.15) 25%,transparent 25%,transparent 50%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.15) 75%,transparent 75%,transparent)',
                         backgroundSize: '1rem 1rem'
                     }}
                ></div>
             </div>
        </div>

        <div className="text-xs text-gray-500 text-center pt-8">
            <p>This process may take several minutes.</p>
            <p>Do not turn off your computer.</p>
        </div>
      </div>
    </StepLayout>
  );
};
