import { toNextJsHandler } from "better-auth/next-js";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(app().auth).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(app().auth).POST(request);
}
