import { NextRequest, NextResponse } from "next/server";
import { createTemplate, listTemplates } from "@/lib/ar-templates/mockDb";
import { reminderTemplateSchema } from "@/lib/ar-templates/schema";

export async function GET() {
  return NextResponse.json(listTemplates());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = reminderTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }
  const record = createTemplate(parsed.data);
  return NextResponse.json(record, { status: 201 });
}
