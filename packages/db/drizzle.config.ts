import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    // Migrations use the direct (unpooled) owner connection.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://localhost/sieveline",
  },
  strict: true,
});
