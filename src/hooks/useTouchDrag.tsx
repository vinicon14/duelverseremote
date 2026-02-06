import { useCallback, useRef, useState } from 'react';

interface TouchDragState {
  isDragging: boolean;
  startPos: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  draggedElement: HTMLElement | null;
  dragData: any;
}

interface UseTouchDragOptions {
  onDragStart?: (data: any, element: HTMLElement) => void;
  onDragEnd?: (data: any, dropZone: Element | null) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  dragThreshold?: number;
}

export const useTouchDrag = (options: UseTouchDragOptions = {}) => {
  const { onDragStart, onDragEnd, onDragMove, dragThreshold = 10 } = options;
  
  const stateRef = useRef<TouchDragState>({
    isDragging: false,
    startPos: null,
    currentPos: null,
    draggedElement: null,
    dragData: null,
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const createGhost = useCallback((element: HTMLElement, x: number, y: number) => {
    // Remove existing ghost
    if (ghostRef.current) {
      ghostRef.current.remove();
    }

    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.8;
      transform: translate(-50%, -50%);
      left: ${x}px;
      top: ${y}px;
    `;
    
    // Clone the element
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.height = `${element.offsetHeight}px`;
    ghost.appendChild(clone);
    
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    
    return ghost;
  }, []);

  const updateGhostPosition = useCallback((x: number, y: number) => {
    if (ghostRef.current) {
      ghostRef.current.style.left = `${x}px`;
      ghostRef.current.style.top = `${y}px`;
    }
  }, []);

  const removeGhost = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
  }, []);

  const findDropZone = useCallback((x: number, y: number): Element | null => {
    removeGhost();
    const element = document.elementFromPoint(x, y);
    
    if (!element) return null;
    
    // Find closest droppable zone
    return element.closest('[data-droppable="true"]');
  }, [removeGhost]);

  const handleTouchStart = useCallback((e: React.TouchEvent, dragData: any) => {
    const touch = e.touches[0];
    const element = e.currentTarget as HTMLElement;
    
    stateRef.current = {
      isDragging: false,
      startPos: { x: touch.clientX, y: touch.clientY },
      currentPos: { x: touch.clientX, y: touch.clientY },
      draggedElement: element,
      dragData,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;
    if (!state.startPos || !state.draggedElement) return;
    
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    
    state.currentPos = { x, y };
    
    // Check if we've moved enough to start dragging
    if (!state.isDragging) {
      const deltaX = Math.abs(x - state.startPos.x);
      const deltaY = Math.abs(y - state.startPos.y);
      
      if (deltaX > dragThreshold || deltaY > dragThreshold) {
        state.isDragging = true;
        setIsDragging(true);
        
        // Prevent scrolling while dragging
        e.preventDefault();
        
        // Create ghost element
        createGhost(state.draggedElement, x, y);
        
        onDragStart?.(state.dragData, state.draggedElement);
      }
    }
    
    if (state.isDragging) {
      e.preventDefault();
      updateGhostPosition(x, y);
      onDragMove?.({ x, y });
    }
  }, [createGhost, updateGhostPosition, onDragStart, onDragMove, dragThreshold]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const state = stateRef.current;
    
    if (state.isDragging && state.currentPos) {
      const dropZone = findDropZone(state.currentPos.x, state.currentPos.y);
      onDragEnd?.(state.dragData, dropZone);
    }
    
    removeGhost();
    setIsDragging(false);
    
    stateRef.current = {
      isDragging: false,
      startPos: null,
      currentPos: null,
      draggedElement: null,
      dragData: null,
    };
  }, [findDropZone, onDragEnd, removeGhost]);

  return {
    isDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};
