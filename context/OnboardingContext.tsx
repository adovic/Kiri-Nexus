'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OnboardingContextType {
  step: number;
  setStep: (step: number) => void;
  isComplete: boolean;
  setIsComplete: (complete: boolean) => void;
  updateField: (field: string, value: any) => boolean;
  getFieldValue: (field: string) => any;
  fields: Record<string, any>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [fields, setFields] = useState<Record<string, any>>({});

  const updateField = (field: string, value: any): boolean => {
    setFields(prev => ({ ...prev, [field]: value }));
    return true;
  };

  const getFieldValue = (field: string) => {
    return fields[field];
  };

  return (
    <OnboardingContext.Provider value={{ step, setStep, isComplete, setIsComplete, updateField, getFieldValue, fields }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    // Return a default value instead of throwing to prevent crashes
    return {
      step: 0,
      setStep: () => {},
      isComplete: false,
      setIsComplete: () => {},
      updateField: () => true,
      getFieldValue: () => undefined,
      fields: {},
    };
  }
  return context;
}
