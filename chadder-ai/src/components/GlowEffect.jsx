import React, { useEffect, useRef, useCallback } from 'react';

const GlowEffect = () => {
  const glowRef = useRef(null);
  
  const handleMouseMove = useCallback((e) => {
    if (!glowRef.current) return;
    
    // Calculate mouse position as percentages of viewport
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    
    // Update CSS variables with smooth transition
    glowRef.current.style.setProperty('--mouse-x', `${x}%`);
    glowRef.current.style.setProperty('--mouse-y', `${y}%`);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!glowRef.current) return;
    
    // Smoothly return to center when mouse leaves
    glowRef.current.style.setProperty('--mouse-x', '50%');
    glowRef.current.style.setProperty('--mouse-y', '50%');
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Optional: Add smooth transition when page loads
    if (glowRef.current) {
      glowRef.current.style.setProperty('--mouse-x', '50%');
      glowRef.current.style.setProperty('--mouse-y', '50%');
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return <div ref={glowRef} className="glow-effect" />;
};

export default GlowEffect; 