import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/login?mode=patient");
  }, [setLocation]);
  return null;
}
