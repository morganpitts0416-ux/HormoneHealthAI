import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export const passwordStrengthSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character (!@#$%^&*)");

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!password || password.length < PASSWORD_MIN_LENGTH) errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter (A–Z)");
  if (!/[a-z]/.test(password)) errors.push("At least one lowercase letter (a–z)");
  if (!/[0-9]/.test(password)) errors.push("At least one number (0–9)");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("At least one special character (!@#$%^&*)");
  return { valid: errors.length === 0, errors };
}
