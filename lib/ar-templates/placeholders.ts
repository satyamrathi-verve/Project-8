export const PLACEHOLDERS = [
  "{customer}",
  "{invoice_no}",
  "{invoice_date}",
  "{due_date}",
  "{amount}",
  "{currency}",
  "{days_overdue}",
  "{payment_link}",
  "{company_name}",
  "{company_email}",
  "{company_phone}",
] as const;

/** Sample data used to render the live preview. */
export const SAMPLE_DATA: Record<string, string> = {
  "{customer}": "ABC Technologies",
  "{invoice_no}": "INV-10045",
  "{invoice_date}": "10 Jul 2026",
  "{due_date}": "25 Jul 2026",
  "{amount}": "₹18,500",
  "{currency}": "INR",
  "{days_overdue}": "15",
  "{payment_link}": "https://pay.abcfinance.com/inv/INV-10045",
  "{company_name}": "ABC Finance Pvt Ltd",
  "{company_email}": "accounts@abcfinance.com",
  "{company_phone}": "+91 9876543210",
};

export function renderWithSampleData(text: string): string {
  let result = text;
  for (const [placeholder, value] of Object.entries(SAMPLE_DATA)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

export const DEFAULT_SUBJECT = "Reminder: Invoice {invoice_no} is overdue.";

export const DEFAULT_BODY_HTML = `
<p>Dear {customer},</p>
<p>This is a friendly reminder that Invoice {invoice_no} for {amount} became due on {due_date}.</p>
<p>The payment is currently overdue by {days_overdue} days.</p>
<p>Please arrange payment at your earliest convenience.</p>
<p>You can make payment here:<br>{payment_link}</p>
<p>If payment has already been made, kindly ignore this email.</p>
<p>Regards,<br>Accounts Team<br>{company_name}</p>
`.trim();
