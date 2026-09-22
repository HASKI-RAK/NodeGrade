import {
  LEGACY_SIMILARITY_WORKER_URL,
  configuration,
  unsetWorkerUrls,
} from './configuration.js';

describe('worker configuration', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('names the worker variables that were left unset', () => {
    delete process.env.MODEL_WORKER_URL;
    delete process.env.SIMILARITY_WORKER_URL;

    expect(unsetWorkerUrls()).toEqual([
      'MODEL_WORKER_URL',
      'SIMILARITY_WORKER_URL',
    ]);
  });

  it('says nothing when both are configured', () => {
    process.env.MODEL_WORKER_URL = 'http://127.0.0.1:8000';
    process.env.SIMILARITY_WORKER_URL = 'http://127.0.0.1:8002';

    expect(unsetWorkerUrls()).toEqual([]);
  });

  // An empty string is what Compose injects for an unset variable, and it has to
  // count as unset: otherwise the deployment most likely to be misconfigured is
  // the one that gets no warning.
  it('treats an empty value as unset', () => {
    process.env.SIMILARITY_WORKER_URL = '';

    expect(unsetWorkerUrls()).toContain('SIMILARITY_WORKER_URL');
  });

  it('falls back to the legacy host so existing deployments keep working', () => {
    delete process.env.SIMILARITY_WORKER_URL;

    expect(configuration().workers.similarityWorkerUrl).toBe(
      LEGACY_SIMILARITY_WORKER_URL,
    );
  });

  it('prefers a configured worker over the fallback', () => {
    process.env.SIMILARITY_WORKER_URL = 'http://models:8002';

    expect(configuration().workers.similarityWorkerUrl).toBe(
      'http://models:8002',
    );
  });
});
