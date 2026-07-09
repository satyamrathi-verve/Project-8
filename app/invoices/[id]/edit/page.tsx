import { isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader title="Edit Invoice" subtitle="Update this invoice's details." />
      {!isConfigured ? <NotConfigured /> : <InvoiceForm invoiceId={params.id} />}
    </>
  );
}
