
import React from 'react';
import { CalculationResult } from '../types';

interface VisualizerProps {
  data: CalculationResult;
}

const Visualizer: React.FC<VisualizerProps> = ({ data }) => {
  const { totalHeight, positions, thickness } = data;
  
  const baseScale = 350;
  const scale = baseScale / totalHeight;
  const width = 180;
  const scaledHeight = totalHeight * scale;

  // VZ-01/VZ-05: viewBox içerik sınırından hesaplanır — ölçü kutuları
  // (sağda width+35..width+70) ve başlık bloğu (altta +45) artık kırpılmaz.
  const vbX = -60;
  const vbY = -40;
  const vbW = width + 140;
  const vbH = scaledHeight + 100;

  return (
    <div className="relative flex flex-col items-center w-full overflow-hidden p-4">
      {/* Blueprint Background Effect */}
      <div className="absolute inset-0 bg-[#1e293b] opacity-100 pattern-grid-lg"></div>

      <svg
        className="relative w-full h-auto max-w-[320px] drop-shadow-2xl z-10"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
           <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5"/>
          </pattern>
        </defs>

        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#1e293b" />
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#grid)" />

        {/* Height Dimension Line */}
        <line x1="-30" y1="0" x2="-30" y2={scaledHeight} stroke="#94a3b8" strokeWidth="1" />
        <line x1="-35" y1="0" x2="-25" y2="0" stroke="#94a3b8" strokeWidth="1" />
        <line x1="-35" y1={scaledHeight} x2="-25" y2={scaledHeight} stroke="#94a3b8" strokeWidth="1" />
        
        <rect x="-40" y={scaledHeight / 2 - 15} width="20" height="30" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" rx="4"/>
        <text 
          x="-30" 
          y={scaledHeight / 2} 
          fill="#e2e8f0" 
          fontSize="10" 
          fontWeight="bold"
          transform={`rotate(-90, -30, ${scaledHeight / 2})`} 
          textAnchor="middle"
          dy="3"
        >
          {totalHeight}
        </text>

        {/* Cabinet Body - Blueprint Style */}
        <rect x="0" y="0" width={width} height={scaledHeight} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="10 5" rx="2" />
        
        {/* Sides */}
        <rect x="0" y="0" width="8" height={scaledHeight} fill="#60a5fa" fillOpacity="0.2" stroke="#60a5fa" strokeWidth="1" />
        <rect x={width - 8} y="0" width="8" height={scaledHeight} fill="#60a5fa" fillOpacity="0.2" stroke="#60a5fa" strokeWidth="1" />

        {/* Shelves */}
        {positions.map((pos, idx) => {
          const yPos = scaledHeight - (pos * scale) - (thickness * scale);
          return (
            <g key={idx}>
              {/* Shelf */}
              <rect 
                x="8" 
                y={yPos} 
                width={width - 16} 
                height={thickness * scale} 
                fill="#60a5fa"
                fillOpacity="0.3"
                stroke="#60a5fa" 
                strokeWidth="1"
              />
              
              {/* Measurement Line */}
              <line x1={width + 5} y1={scaledHeight - (pos * scale)} x2={width + 35} y2={scaledHeight - (pos * scale)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
              
              {/* Value Box */}
              <rect x={width + 35} y={scaledHeight - (pos * scale) - 10} width="35" height="20" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
              <text 
                x={width + 52.5} 
                y={scaledHeight - (pos * scale) + 4} 
                fill="#fbbf24" 
                fontSize="11" 
                fontWeight="bold"
                textAnchor="middle"
                className="font-mono"
              >
                {pos}
              </text>

              {/* Pin Center Crosshair */}
              <line x1="12" y1={scaledHeight - (pos * scale)} x2="18" y2={scaledHeight - (pos * scale)} stroke="#ef4444" strokeWidth="1" />
              <line x1="15" y1={scaledHeight - (pos * scale) - 3} x2="15" y2={scaledHeight - (pos * scale) + 3} stroke="#ef4444" strokeWidth="1" />
              
              <line x1={width - 18} y1={scaledHeight - (pos * scale)} x2={width - 12} y2={scaledHeight - (pos * scale)} stroke="#ef4444" strokeWidth="1" />
              <line x1={width - 15} y1={scaledHeight - (pos * scale) - 3} x2={width - 15} y2={scaledHeight - (pos * scale) + 3} stroke="#ef4444" strokeWidth="1" />
            </g>
          );
        })}

        {/* Title Block */}
        <rect x={width/2 - 60} y={scaledHeight + 20} width="120" height="25" fill="#0f172a" stroke="#60a5fa" strokeWidth="1" />
        <text x={width / 2} y={scaledHeight + 36} textAnchor="middle" fill="#60a5fa" fontSize="10" fontWeight="bold" letterSpacing="2">
          TEKNİK ŞEMA
        </text>
      </svg>
    </div>
  );
};

export default Visualizer;
