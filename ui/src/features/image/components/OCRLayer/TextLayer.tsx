import React from "react";
import styles from "./OCRLayer.module.css";

interface OCRBox {
  text: string;
  box: number[][];
}

interface TextLayerProps {
  data: OCRBox[];
  size: { w: number; h: number };
  svgRef: React.RefObject<SVGSVGElement | null>;
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
      className={styles.textLayer}
      data-text-layer
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Define mask: white background with black cutouts for text areas */}
      <defs>
        <mask id="textCutoutMask">
          {/* White = visible, Black = hidden */}
          <rect x="0" y="0" width={size.w} height={size.h} fill="white" />
          {data.map((item, i) => {
            const points = item.box.map((p) => `${p[0]},${p[1]}`).join(" ");
            return <polygon key={`mask-${i}`} points={points} fill="black" />;
          })}
        </mask>
      </defs>

      {/* Dim overlay with mask - doesn't cover text areas */}
      <rect
        x="0"
        y="0"
        width={size.w}
        height={size.h}
        className={styles.dimOverlay}
        mask="url(#textCutoutMask)"
      />

      {/* Highlight and text layers */}
      {data.map((item, i) => {
        const b = item.box;
        const points = b.map((p) => `${p[0]},${p[1]}`).join(" ");
        const h = Math.abs(b[3][1] - b[0][1]);
        const w = Math.abs(b[1][0] - b[0][0]);

        return (
          <g key={i}>
            {/* Brightness highlight on text area */}
            <polygon className={styles.highlightBg} points={points} />
            <text
              id={`text-${i}`}
              x={b[0][0]}
              y={b[0][1] + h * 0.78}
              fontSize={h * 0.85}
              fontFamily="'Arial Narrow', Arial, sans-serif"
              textLength={w}
              lengthAdjust="spacingAndGlyphs"
              className={styles.selectableText}
              data-selectable-text
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
