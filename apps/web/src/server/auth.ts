import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { hash, verify } from "@node-rs/argon2";
import type { Logger, ServerEnv } from "@sieveline/core";
import { createWorkspaceForUser, schema, type AnyDb } from "@sieveline/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { waitUntil } from "@vercel/functions";
import { nextCookies } from "better-auth/next-js";
import { captcha, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { actionEmail, type EmailSender } from "./email";

/** OWASP Password Storage Cheat Sheet minimum for Argon2id: m=19 MiB, t=2, p=1. */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export interface AuthDeps {
  db: AnyDb;
  env: ServerEnv;
  email: EmailSender;
  log: Logger;
  /** Tests disable network-backed plugins (breached-password check, captcha). */
  offline?: boolean;
}

export function createAuth({ db, env, email, log, offline = false }: AuthDeps) {
  const production = env.NODE_ENV === "production";
  const ownerEmails = new Set(env.PLATFORM_OWNER_EMAILS.map((e) => e.toLowerCase()));

  const plugins: NonNullable<BetterAuthOptions["plugins"]> = [twoFactor({ issuer: "Sieveline" })];
  if (!offline) {
    plugins.push(haveIBeenPwned({ customPasswordCompromisedMessage: "This password appears in a known data breach. Please choose another." }));
    if (env.TURNSTILE_SECRET_KEY) {
      plugins.push(captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET_KEY }));
    }
  }
  plugins.push(nextCookies()); // must be last

  const socialProviders: BetterAuthOptions["socialProviders"] =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" } }
      : {};

  return betterAuth({
    appName: "Sieveline",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users, sessions: schema.sessions, accounts: schema.accounts,
        verifications: schema.verifications, twoFactors: schema.twoFactors, rateLimits: schema.rateLimits,
      },
    }),
    user: {
      additionalFields: {
        platformRole: { type: "string", required: false, input: false, defaultValue: "none" },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password, ARGON2),
      },
      sendResetPassword: async ({ user, url }) => {
        await email.send(actionEmail({
          to: user.email,
          subject: "Reset your Sieveline password",
          intro: "Someone asked to reset the password for this account.",
          action: "Choose a new password",
          url,
          outro: "This link works for 30 minutes. If you didn't ask for this, you can ignore this email.",
        }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send(actionEmail({
          to: user.email,
          subject: "Confirm your email for Sieveline",
          intro: "Welcome to Sieveline. Please confirm this is your email address.",
          action: "Confirm email",
          url,
          outro: "This link works for 24 hours. If you didn't create an account, you can ignore this email.",
        }));
      },
      // Platform owners are granted only after they prove control of the email address.
      afterEmailVerification: async (user) => {
        if (ownerEmails.has(user.email.toLowerCase())) {
          await db.update(schema.users).set({ platformRole: "owner" }).where(eq(schema.users.id, user.id));
          log.warn("platform owner granted", { userId: user.id });
        }
      },
    },
    socialProviders,
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 10, max: 3 },
        "/send-verification-email": { window: 60 * 10, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: production,
      // Better Auth skips origin checks when NODE_ENV=test by default. Set explicitly so tests
      // exercise exactly the production CSRF behavior.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: "sl",
      // Emails and cleanup run after the response; on Vercel they must be registered with
      // waitUntil or the function can be frozen before they finish. Off Vercel it is a no-op.
      backgroundTasks: { handler: waitUntil },
      ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] },
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const first = (user.name || user.email).split(/[\s@]/)[0] || "My";
            await createWorkspaceForUser(db, {
              userId: user.id,
              name: `${first}'s workspace`,
              monthlyCreditCap: env.DEFAULT_WORKSPACE_MONTHLY_CREDIT_CAP,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [u] = await db
              .select({ suspendedAt: schema.users.suspendedAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (u?.suspendedAt) throw new APIError("FORBIDDEN", { message: "This account is suspended." });
          },
        },
      },
    },
    logger: {
      level: production ? "error" : "warn",
      // Keep the error Better Auth passes along (the logger redacts secrets); without it a failure
      // such as an email provider error shows up only as "Failed to run background task".
      log: (level, message, ...args) =>
        log[level === "debug" ? "info" : level](`auth: ${message}`, args[0] instanceof Error ? { err: args[0] } : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
