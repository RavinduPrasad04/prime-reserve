import WorkspaceShell from "@/components/layout/WorkspaceShell";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" aria-busy="true" />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  await connection();
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  }
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
