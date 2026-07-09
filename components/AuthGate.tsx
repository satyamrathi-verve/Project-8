"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

/* Hides the whole app behind Sign In. The /signin page itself is always shown. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const ok = isAuthenticated();
    setAuthed(ok);
    setReady(true);
    if (!ok && pathname !== "/signin") {
      router.replace("/signin");
    }
  }, [pathname, router]);

  if (pathname === "/signin") return <>{children}</>;
  if (!ready || !authed) return null;
  return <>{children}</>;
}
