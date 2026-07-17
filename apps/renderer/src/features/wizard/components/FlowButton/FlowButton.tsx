import React from "react";
import styles from "./FlowButton.module.css";

interface FlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "next" | "cancel" | "back";
}

export const FlowButton: React.FC<FlowButtonProps> = ({
  className,
  children,
  variant = "next",
  ...props
}) => {
  return (
    <button
      className={`${styles.flowButton} ${variant === "back" ? styles.back : variant === "cancel" ? styles.cancel : styles.next} ${className || ""}`}
      {...props}
    >
      {children ||
        (variant === "next"
          ? "Next"
          : variant === "cancel"
            ? "Cancel"
            : "Back")}
    </button>
  );
};
