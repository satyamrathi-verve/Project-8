import { ToastProvider } from "@/components/ui/toast";

export default function ArTemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="p-8">{children}</div>
    </ToastProvider>
  );
}
