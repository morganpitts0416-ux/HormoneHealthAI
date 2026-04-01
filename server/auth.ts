import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      username: string;
      firstName: string;
      lastName: string;
      title: string;
      clinicName: string;
      npi?: string | null;
      phone?: string | null;
      address?: string | null;
    }
  }
}

passport.use(
  new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username)
          ?? await storage.getUserByEmail(username.trim().toLowerCase());
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        // HIPAA: Check if account is locked
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
          return done(null, false, {
            message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
          });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          storage.recordLoginAttempt(user.id, false).catch(() => {});
          return done(null, false, { message: "Invalid username or password" });
        }

        // Success — reset lockout counter
        storage.recordLoginAttempt(user.id, true).catch(() => {});
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUserById(id);
    if (!user) return done(null, false);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export { passport };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
