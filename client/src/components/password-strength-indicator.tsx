import { validatePasswordStrength } from "@shared/password-policy";
import { CheckCircle2, XCircle } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
}

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter (a–z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number (0–9)", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character (!@#$%^&*)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  return (
    <ul className="mt-2 space-y-1 text-xs" data-testid="password-strength-indicator">
      {REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <li key={req.label} className={`flex items-center gap-1.5 ${met ? "text-green-600" : "text-muted-foreground"}`}>
            {met ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
            {req.label}
          </li>
        );
      })}
    </ul>
  );
}
