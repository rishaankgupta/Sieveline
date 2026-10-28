import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AuthCard } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to Sieveline? <a className="font-medium underline" href="/sign-up">Create an account</a>
        </>
      }
    >
      <Suspense>
        <SignInForm nonce={nonce} googleEnabled={googleEnabled} />
      </Suspense>
    </AuthCard>
  );
}
