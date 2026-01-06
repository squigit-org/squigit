/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface OCRBox {
  text: string;
  box: number[][];
}

interface TextLayerProps {
  data: OCRBox[];
  size: { w: number; h: number };
  svgRef: React.RefObject<SVGSVGElement>;
  onTextMouseDown: (e: React.MouseEvent, boxIndex: number) => void;
}

export const TextLayer: React.FC<TextLayerProps> = ({
  data,
  size,
  svgRef,
  onTextMouseDown,
}) => {
  if (data.length === 0 || size.w === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="text-layer"
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {data.map((item, i) => {
        const b = item.box;
        const points = b.map((p) => `${p[0]},${p[1]}`).join(" ");
        const h = Math.abs(b[3][1] - b[0][1]);
        const w = Math.abs(b[1][0] - b[0][0]);

        return (
          <g key={i}>
            <polygon className="highlight-bg" points={points} />
            <text
              id={`text-${i}`}
              x={b[0][0]}
              y={b[0][1] + h * 0.78}
              fontSize={h * 0.85}
              fontFamily="'Arial Narrow', Arial, sans-serif"
              textLength={w}
              lengthAdjust="spacingAndGlyphs"
              className="selectable-text"
              onMouseDown={(e) => onTextMouseDown(e, i)}
            >
              {item.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
