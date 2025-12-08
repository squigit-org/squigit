/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  className = "",
  disabled,
  ...props
}) => {
  const baseStyle =
    "px-6 py-1.5 w-[100px] text-sm font-medium border transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none flex justify-center items-center";

  const variants = {
    primary:
      "bg-gray-900 text-white border-gray-900 hover:bg-gray-800 shadow-sm",
    secondary:
      "bg-gray-100 text-black border-gray-300 hover:bg-gray-200 hover:border-gray-400",
    danger: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
