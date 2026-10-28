import "server-only";
import { createLogger, loadServerEnv, type LlmClient, type ServerEnv } from "@sieveline/core";
import { createDb, type Db } from "@sieveline/db";
import { createAuth, type Auth } from "./auth";
import { createEmailSender } from "./email";
import { createLlm } from "./llm";

interface AppContext {
  env: ServerEnv;
  db: Db;
  auth: Auth;
  llm: LlmClient | null;
}

let ctx: AppContext | undefined;

/** Lazily builds shared server objects once per server instance. */
export function app(): AppContext {
  if (!ctx) {
    const env = loadServerEnv();
    const log = createLogger({ service: "web" });
    const db = createDb(env.DATABASE_URL);
    const auth = createAuth({ db, env, email: createEmailSender(env, log), log });
    ctx = { env, db, auth, llm: createLlm(env) };
  }
  return ctx;
}

export const logger = createLogger({ service: "web" });
