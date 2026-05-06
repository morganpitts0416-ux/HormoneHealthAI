import { createContext, useContext, useState, useCallback } from "react";

interface SoapNoteContextValue {
  activeSoapNote: string | null;
  setActiveSoapNote: (note: string | null) => void;
  onApplySoapEdit: ((newNote: string) => void) | null;
  registerSoapEditor: (applyFn: (newNote: string) => void) => void;
  unregisterSoapEditor: () => void;
}

const SoapNoteContext = createContext<SoapNoteContextValue>({
  activeSoapNote: null,
  setActiveSoapNote: () => {},
  onApplySoapEdit: null,
  registerSoapEditor: () => {},
  unregisterSoapEditor: () => {},
});

export function SoapNoteContextProvider({ children }: { children: React.ReactNode }) {
  const [activeSoapNote, setActiveSoapNote] = useState<string | null>(null);
  // Store the apply function as state. The `() => applyFn` wrapper is required
  // because React's useState setter also accepts a function — without the wrapper,
  // React would call applyFn as a state initialiser rather than storing it.
  const [onApplySoapEdit, setOnApplySoapEdit] = useState<((newNote: string) => void) | null>(null);

  const registerSoapEditor = useCallback((applyFn: (newNote: string) => void) => {
    setOnApplySoapEdit(() => applyFn);
  }, []);

  const unregisterSoapEditor = useCallback(() => {
    setOnApplySoapEdit(null);
    setActiveSoapNote(null);
  }, []);

  return (
    <SoapNoteContext.Provider value={{
      activeSoapNote,
      setActiveSoapNote,
      onApplySoapEdit,
      registerSoapEditor,
      unregisterSoapEditor,
    }}>
      {children}
    </SoapNoteContext.Provider>
  );
}

export function useSoapNoteContext() {
  return useContext(SoapNoteContext);
}
