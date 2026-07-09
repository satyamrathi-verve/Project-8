import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AR Manager — Verve",
  description: "Accounts Receivable manager",
};

/*
  Apply the saved theme before paint so there's no light/dark flash. Only ever
  switch to dark when the user explicitly opted in via ThemeToggle — most
  screens aren't styled with dark: variants yet, so following the OS
  preference here would silently break their layout.
*/
const themeScript = `(function(){try{if(localStorage.getItem('erp_theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
