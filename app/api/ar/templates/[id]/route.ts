import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/ar-templates/mockDb";
import { reminderTemplateSchema } from "@/lib/ar-templates/schema";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const record = getTemplate(params.id);
  if (!record) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = reminderTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }
  const record = updateTemplate(params.id, parsed.data);
  if (!record) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteTemplate(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
