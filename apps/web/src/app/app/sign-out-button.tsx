"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await authClient.signOut();
        window.location.assign("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
