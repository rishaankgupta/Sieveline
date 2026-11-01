import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthCard } from "@/components/ui";
import { app } from "@/server/context";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const demoMode = app().env.DEMO_MODE;
  return (
    <AuthCard
      title="Create your account"
      subtitle={demoMode ? "Early access: you are signed in right away, no email confirmation yet." : "Find the few businesses worth buying."}
      footer={
        <>
          Already have an account? <a className="font-medium underline" href="/sign-in">Sign in</a>
        </>
      }
    >
      <SignUpForm nonce={nonce} demoMode={demoMode} />
    </AuthCard>
  );
}
