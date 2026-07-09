import { randomUUID } from "crypto";
import type { ReminderTemplateRecord, ReminderTemplatePayload } from "./types";
import { DEFAULT_BODY_HTML, DEFAULT_SUBJECT } from "./placeholders";

/*
  Standalone mock backend for this module — an in-memory array, not the real
  Supabase project. It resets whenever the dev server restarts. This exists
  only because the module was specced with a REST API and DB fields
  (createdBy/createdAt/updatedAt) that the real event database doesn't have.
*/

declare global {
  // eslint-disable-next-line no-var
  var __arTemplatesMockDb: ReminderTemplateRecord[] | undefined;
}

function seed(): ReminderTemplateRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: randomUUID(),
      templateName: "Standard Overdue Reminder",
      subject: DEFAULT_SUBJECT,
      body: DEFAULT_BODY_HTML,
      status: true,
      createdBy: "Balaji Prabhu Shinde",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function getStore(): ReminderTemplateRecord[] {
  if (!global.__arTemplatesMockDb) {
    global.__arTemplatesMockDb = seed();
  }
  return global.__arTemplatesMockDb;
}

export function listTemplates(): ReminderTemplateRecord[] {
  return [...getStore()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTemplate(id: string): ReminderTemplateRecord | undefined {
  return getStore().find((t) => t.id === id);
}

export function createTemplate(payload: ReminderTemplatePayload): ReminderTemplateRecord {
  const now = new Date().toISOString();
  const record: ReminderTemplateRecord = {
    id: randomUUID(),
    templateName: payload.templateName,
    subject: payload.subject,
    body: payload.body,
    status: payload.status,
    createdBy: "Balaji Prabhu Shinde",
    createdAt: now,
    updatedAt: now,
  };
  getStore().push(record);
  return record;
}

export function updateTemplate(
  id: string,
  payload: ReminderTemplatePayload
): ReminderTemplateRecord | undefined {
  const store = getStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  const updated: ReminderTemplateRecord = {
    ...store[idx],
    templateName: payload.templateName,
    subject: payload.subject,
    body: payload.body,
    status: payload.status,
    updatedAt: new Date().toISOString(),
  };
  store[idx] = updated;
  return updated;
}

export function deleteTemplate(id: string): boolean {
  const store = getStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}
