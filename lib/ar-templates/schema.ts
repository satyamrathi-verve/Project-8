import { z } from "zod";

export const reminderTemplateSchema = z.object({
  templateName: z.string().trim().min(1, "Template name is required."),
  status: z.boolean(),
  subject: z.string().trim().min(1, "Subject is required."),
  body: z.string().refine((v) => v.replace(/<[^>]*>/g, "").trim().length > 0, {
    message: "Body is required.",
  }),
});

export type ReminderTemplateFormValues = z.infer<typeof reminderTemplateSchema>;
