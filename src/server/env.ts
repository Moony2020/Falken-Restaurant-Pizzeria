import { z } from "zod";

// Server-only configuration. Secrets come from .env.local (never committed) or the host's secret store.
// Imported with relative paths so scripts run by plain `node` can use it too.

const schema = z.object({
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in." })
    .regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must start with mongodb:// or mongodb+srv://")
    .refine((v) => !/<db_password>|<password>|<db_username>/.test(v), "MONGODB_URI still contains a placeholder"),
  MONGODB_DB: z.string().min(1).default("falken"),
});

export type ServerEnv = z.infer<typeof schema>;

export function getEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Report which variable is wrong, never its value: connection strings contain passwords.
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  return parsed.data;
}
