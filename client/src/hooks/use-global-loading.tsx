import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type LoadingMessage =
  | "Transcribing audio…"
  | "Generating SOAP note…"
  | "Analyzing encounter…"
  | "Generating clinical insights…"
  | "Normalizing transcript…"
  | "Extracting clinical facts…"
  | "Identifying clinical patterns…"
  | "Searching clinical evidence…"
  | "Validating SOAP note…"
  | "Evaluating lab results…"
  | "Generating patient summary…"
  | string;

type GlobalLoadingContextType = {
  isLoading: boolean;
  message: LoadingMessage;
  setLoading: (message: LoadingMessage) => void;
  clearLoading: () => void;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextType | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoadingMessage>("");

  const setLoading = useCallback((msg: LoadingMessage) => {
    setMessage(msg);
    setIsLoading(true);
  }, []);

  const clearLoading = useCallback(() => {
    setIsLoading(false);
    setMessage("");
  }, []);

  return (
    <GlobalLoadingContext.Provider value={{ isLoading, message, setLoading, clearLoading }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  return ctx;
}
