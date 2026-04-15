import { createContext, useContext, useState, useCallback } from "react";

interface PatientContextValue {
  currentPatient: { id: number; name: string } | null;
  setCurrentPatient: (patient: { id: number; name: string } | null) => void;
}

const PatientContext = createContext<PatientContextValue>({
  currentPatient: null,
  setCurrentPatient: () => {},
});

export function PatientContextProvider({ children }: { children: React.ReactNode }) {
  const [currentPatient, setCurrentPatientState] = useState<{ id: number; name: string } | null>(null);

  const setCurrentPatient = useCallback((patient: { id: number; name: string } | null) => {
    setCurrentPatientState(patient);
  }, []);

  return (
    <PatientContext.Provider value={{ currentPatient, setCurrentPatient }}>
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientContext() {
  return useContext(PatientContext);
}
