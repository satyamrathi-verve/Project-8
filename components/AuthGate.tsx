"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { isSignedIn } from "@/lib/auth";

/*
  Gates the whole app behind Sign In. /signin renders full-screen with no
  sidebar; every other route requires a signed-in session (checked in
  localStorage) or bounces to /signin.
*/
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
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
}
