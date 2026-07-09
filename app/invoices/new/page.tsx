import { isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader title="New Invoice" subtitle="Punch a new sales invoice." />
      {!isConfigured ? <NotConfigured /> : <InvoiceForm />}
    </>
  );
}
