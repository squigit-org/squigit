import React from 'react';
import styles from './FlowButton.module.css';

interface FlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'next' | 'back';
}

export const FlowButton: React.FC<FlowButtonProps> = ({ className, children, variant = 'next', ...props }) => {
  return (
    <button className={`${styles.flowButton} ${variant === 'back' ? styles.back : styles.next} ${className || ''}`} {...props}>
      {children || (variant === 'next' ? 'Next' : 'Back')}
    </button>
  );
};
