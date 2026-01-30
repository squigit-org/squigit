import React, { useRef } from "react";
import styles from "./SpotlightCard.module.css";

interface SpotlightCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  ...props
}) => {
  const divRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!divRef.current) return;

    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    divRef.current.style.setProperty("--mouse-x", `${x}px`);
    divRef.current.style.setProperty("--mouse-y", `${y}px`);
  };

  return (
    <button
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={styles.spotlightCard}
      {...props}
    >
      {/* ISOLATION LAYER: This handles clipping but DOES NOT transform */}
      <span className={styles.cardInner}>
        <div className={styles.spotlightContent}>{children}</div>
      </span>
    </button>
  );
};
