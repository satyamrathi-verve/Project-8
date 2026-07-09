export interface ReminderTemplateRecord {
  id: string;
  templateName: string;
  subject: string;
  body: string;
  status: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderTemplatePayload {
  templateName: string;
  status: boolean;
  subject: string;
  body: string;
}
