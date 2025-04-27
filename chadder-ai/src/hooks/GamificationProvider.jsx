import { createContext, useContext, useState, useEffect } from 'react';
import { useGamification } from './useGamification';
import { useAuth } from './AuthProvider';

// Create context
export const GamificationContext = createContext(null);

// Hook for components to consume the context
export const useGamificationContext = () => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamificationContext must be used within a GamificationProvider');
  }
  return context;
};

// Provider component
export const GamificationProvider = ({ children }) => {
  const { user } = useAuth();
  const gamification = useGamification();
  
  return (
    <GamificationContext.Provider value={gamification}>
      {children}
    </GamificationContext.Provider>
  );
}; 