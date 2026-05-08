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

export type JuneImage = "analyzing" | "soap";

type GlobalLoadingContextType = {
  isLoading: boolean;
  message: LoadingMessage;
  juneMode: boolean;
  juneImage: JuneImage;
  setLoading: (message: LoadingMessage, options?: { june?: boolean; juneImage?: JuneImage }) => void;
  clearLoading: () => void;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextType | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<LoadingMessage>("");
  const [juneMode, setJuneMode] = useState(false);
  const [juneImage, setJuneImage] = useState<JuneImage>("analyzing");

  const setLoading = useCallback((msg: LoadingMessage, options?: { june?: boolean; juneImage?: JuneImage }) => {
    setMessage(msg);
    setIsLoading(true);
    setJuneMode(options?.june ?? false);
    setJuneImage(options?.juneImage ?? "analyzing");
  }, []);

  const clearLoading = useCallback(() => {
    setIsLoading(false);
    setMessage("");
    setJuneMode(false);
    setJuneImage("analyzing");
  }, []);

  return (
    <GlobalLoadingContext.Provider value={{ isLoading, message, juneMode, juneImage, setLoading, clearLoading }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  return ctx;
}
