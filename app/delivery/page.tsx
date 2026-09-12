import prisma from "@/lib/prisma";
import type { DeliveryLogData } from "@/lib/types";
import DeliveryClient from "./delivery-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Delivery Tracker" };

export default async function DeliveryPage() {
  const logs = await prisma.deliveryLog.findMany({ orderBy: { createdAt: "desc" } });

  const data: DeliveryLogData[] = logs.map((log) => ({
    id: log.id,
    driverName: log.driverName,
    destinationClient: log.destinationClient,
    itemsSummary: log.itemsSummary,
    totalValue: log.totalValue,
    status: log.status,
    createdAt: log.createdAt.toISOString(),
  }));

  return <DeliveryClient logs={data} />;
}
