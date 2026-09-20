import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { readBillPhoto } from "@/lib/bill-photos";

/** Serves the optional compressed photo stored on disk for a bill record. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bill = await prisma.purchaseBill.findUnique({ where: { id }, select: { photoPath: true } });
  const photo = bill?.photoPath ? readBillPhoto(bill.photoPath) : null;
  if (!photo) {
    return NextResponse.json({ error: "No photo for this bill." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
