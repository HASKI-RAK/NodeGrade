import { resolveCorsOrigins } from './cors.js';

/**
 * The model worker address used before MODEL_WORKER_URL existed. It was hardcoded in
 * three separate places; centralising it here keeps the current behaviour while the
 * provider subsystem (SPEC-0011) is built. Remove once providers are seeded from the
 * database rather than from the environment.
 */
export const LEGACY_MODEL_WORKER_URL = 'http://193.174.195.36:8000';
export const LEGACY_SIMILARITY_WORKER_URL = 'http://193.174.195.36:8002';

/**
 * Names the worker variables that were left unset, so the caller can say which
 * traffic is about to leave the machine.
 *
 * These fallbacks are a third-party host. A developer who runs `yarn dev`
 * without an `.env` still gets working similarity and keyword nodes, which is
 * convenient and is exactly the problem: every answer those nodes touch is sent
 * somewhere nobody chose. Silence is the wrong default for that.
 */
export const unsetWorkerUrls = (): string[] =>
  [
    process.env.MODEL_WORKER_URL ? '' : 'MODEL_WORKER_URL',
    process.env.SIMILARITY_WORKER_URL ? '' : 'SIMILARITY_WORKER_URL',
  ].filter(Boolean);

export type AppConfig = {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  frontendUrl: string;
  cookiesInsecure: boolean;
  runNodeTimeoutMs: number;
  workers: {
    modelWorkerUrl: string;
    similarityWorkerUrl: string;
    openAiApiKey?: string;
    bearerToken?: string;
  };
  xapi: {
    endpoint: string;
    username: string;
    password: string;
  };
};

const toBool = (raw: string | undefined): boolean =>
  raw === 'true' || raw === '1';

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  corsOrigins: resolveCorsOrigins(),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  cookiesInsecure: toBool(process.env.COOKIE_INSECURE),
  runNodeTimeoutMs: Number(process.env.RUN_NODE_TIMEOUT_MS ?? 120_000),
  workers: {
    modelWorkerUrl: process.env.MODEL_WORKER_URL || LEGACY_MODEL_WORKER_URL,
    similarityWorkerUrl:
      process.env.SIMILARITY_WORKER_URL || LEGACY_SIMILARITY_WORKER_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
    bearerToken: process.env.BEARER_TOKEN,
  },
  xapi: {
    endpoint: process.env.XAPI_ENDPOINT ?? '',
    username: process.env.XAPI_USERNAME ?? '',
    password: process.env.XAPI_PASSWORD ?? '',
  },
});
