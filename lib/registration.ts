export type RegistrationInput = {
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  password: string;
  confirmPassword: string;
};

export type ValidatedRegistrationInput = RegistrationInput & {
  name: string;
  email: string;
};

export function validateRegistrationInput(
  input: unknown,
): { ok: false; error: string } | { ok: true; data: ValidatedRegistrationInput } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Enter valid registration details." };
  }

  const value = input as Record<string, unknown>;
  if (
    typeof value.name !== "string" ||
    typeof value.email !== "string" ||
    typeof value.department !== "string" ||
    typeof value.jobTitle !== "string" ||
    typeof value.password !== "string" ||
    typeof value.confirmPassword !== "string"
  ) {
    return { ok: false, error: "Complete all required registration fields." };
  }

  const name = value.name.trim();
  const email = value.email.trim().toLowerCase();
  const department = value.department.trim();
  const jobTitle = value.jobTitle.trim();

  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters." };
  if (name.length > 100) return { ok: false, error: "Name must be 100 characters or fewer." };
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (department.length > 100) return { ok: false, error: "Department must be 100 characters or fewer." };
  if (jobTitle.length > 100) return { ok: false, error: "Job title must be 100 characters or fewer." };
  if (value.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (value.password !== value.confirmPassword) {
    return { ok: false, error: "Password and confirmation do not match." };
  }

  return {
    ok: true,
    data: { name, email, department, jobTitle, password: value.password, confirmPassword: value.confirmPassword },
  };
}
