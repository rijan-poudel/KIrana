import prisma from "@/lib/prisma";
import type { CustomerOption } from "@/lib/types";
import KhataClient from "./khata-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Udharo Khata" };

export default async function KhataPage() {
  const customers = await prisma.customer.findMany({ orderBy: [{ currentBalance: "desc" }, { name: "asc" }] });

  const options: CustomerOption[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    currentBalance: c.currentBalance,
  }));

  return <KhataClient customers={options} />;
}
