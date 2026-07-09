"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
<<<<<<< HEAD
import { isAuthenticated } from "@/lib/auth";

/* Hides the whole app behind Sign In. The /signin page itself is always shown. */
=======
import { Nav } from "@/components/Nav";
import { isSignedIn } from "@/lib/auth";

/*
  Gates the whole app behind Sign In. /signin renders full-screen with no
  sidebar; every other route requires a signed-in session (checked in
  localStorage) or bounces to /signin.
*/
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
<<<<<<< HEAD
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
=======
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const signed = isSignedIn();
    setSignedIn(signed);
    if (!signed && pathname !== "/signin") {
      router.replace("/signin");
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (pathname === "/signin") {
    return <>{children}</>;
  }

  if (!ready || !signedIn) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      <Nav />
      <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
    </div>
  );
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
}
