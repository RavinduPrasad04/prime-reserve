import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import BookingSettingsClient from "./BookingSettingsClient";

export default function BookingSettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" aria-busy="true" />}>
      <BookingSettingsContent />
    </Suspense>
  );
}

async function BookingSettingsContent() {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/dashboard");
    throw error;
  }

  const resources = await prisma.resource.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <BookingSettingsClient resources={resources} />;
}
