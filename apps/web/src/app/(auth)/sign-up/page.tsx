import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthCard } from "@/components/ui";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <AuthCard
      title="Create your account"
      subtitle="Find the few businesses worth buying."
      footer={
        <>
          Already have an account? <a className="font-medium underline" href="/sign-in">Sign in</a>
        </>
      }
    >
      <SignUpForm nonce={nonce} />
    </AuthCard>
  );
}
