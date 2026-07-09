import type { ReminderTemplateRecord, ReminderTemplatePayload } from "./types";

const BASE_URL = "/api/ar/templates";

async function parseOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function listTemplates(): Promise<ReminderTemplateRecord[]> {
  const res = await fetch(BASE_URL);
  return parseOrThrow(res);
}

export async function getTemplate(id: string): Promise<ReminderTemplateRecord> {
  const res = await fetch(`${BASE_URL}/${id}`);
  return parseOrThrow(res);
}

export async function createTemplate(
  payload: ReminderTemplatePayload
): Promise<ReminderTemplateRecord> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function updateTemplate(
  id: string,
  payload: ReminderTemplatePayload
): Promise<ReminderTemplateRecord> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
}
