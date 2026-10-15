import { prisma } from "@/lib/prisma";
import { readSessionUserId } from "@/lib/session";
import type { SessionUserView } from "@/lib/domain";

export async function getCurrentUser(): Promise<SessionUserView | null> {
  const id = await readSessionUserId();
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, department: true, jobTitle: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    jobTitle: user.jobTitle,
  };
}

function unauthorized(): never {
  const error = new Error("UNAUTHORIZED") as Error & { code: string };
  error.code = "UNAUTHORIZED";
  throw error;
}

export async function requireUser(): Promise<SessionUserView> {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  return user;
}

export async function requireAdmin(): Promise<SessionUserView> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    const error = new Error("FORBIDDEN") as Error & { code: string };
    error.code = "FORBIDDEN";
    throw error;
  }
  return user;
}
