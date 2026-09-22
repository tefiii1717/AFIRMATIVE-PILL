import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/afirmative_pill',
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  port: int(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  projectionDelayMs: int(process.env.PROJECTION_DELAY_MS, 800),
  approvalDelayMs: int(process.env.APPROVAL_DELAY_MS, 4000),
  autoApproval: bool(process.env.AUTO_APPROVAL, true),
  logSql: bool(process.env.LOG_SQL, true),
  logDataLoader: bool(process.env.LOG_DATALOADER, true),
};
