import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui";
import { app } from "@/server/context";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Join workspace" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const safe = token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
  const session = await app().auth.api.getSession({ headers: await headers() });
  if (safe && !session) redirect(`/sign-in?next=${encodeURIComponent(`/invite?token=${safe}`)}`);
  return (
    <AuthCard title="Join a workspace">
      {safe ? (
        <AcceptInvite token={safe} email={session!.user.email} />
      ) : (
        <p>This invitation link is incomplete. Please open the link from your email again.</p>
      )}
    </AuthCard>
  );
}
