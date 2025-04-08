import { useState, useRef, useEffect, useCallback } from 'react';

interface ResizableSplitViewProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  initialLeftWidth?: number; // Initial width in percentage (0-100)
  minLeftWidth?: number; // Minimum width in percentage
  maxLeftWidth?: number; // Maximum width in percentage
}

export function ResizableSplitView({
  leftPane,
  rightPane,
  initialLeftWidth = 50,
  minLeftWidth = 30,
  maxLeftWidth = 70,
}: ResizableSplitViewProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startLeftWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startLeftWidth.current = leftWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const deltaX = e.clientX - startX.current;
    const deltaPercentage = (deltaX / containerWidth) * 100;
    
    let newLeftWidth = startLeftWidth.current + deltaPercentage;
    
    // Clamp the value between min and max
    newLeftWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth));
    
    setLeftWidth(newLeftWidth);
  }, [minLeftWidth, maxLeftWidth]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={containerRef}
      className="flex w-full h-full relative"
    >
      <div 
        className="overflow-auto"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPane}
      </div>
      
      <div 
        className="absolute top-0 bottom-0 w-4 bg-transparent cursor-col-resize z-10 flex items-center justify-center"
        style={{ left: `calc(${leftWidth}% - 8px)` }}
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-16 bg-gray-300 rounded-full"></div>
      </div>
      
      <div 
        className="overflow-auto"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPane}
      </div>
    </div>
  );
}
