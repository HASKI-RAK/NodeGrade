import {
  LEGACY_SIMILARITY_WORKER_URL,
  configuration,
  similarityWorkerUnset,
} from './configuration.js';

describe('worker configuration', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('reports the NLP worker as unset when nothing configured it', () => {
    delete process.env.SIMILARITY_WORKER_URL;

    expect(similarityWorkerUnset()).toBe(true);
  });

  it('says nothing once it is configured', () => {
    process.env.SIMILARITY_WORKER_URL = 'http://127.0.0.1:8002';

    expect(similarityWorkerUnset()).toBe(false);
  });

  // An empty string is what Compose injects for an unset variable, and it has to
  // count as unset: otherwise the deployment most likely to be misconfigured is
  // the one that gets no warning.
  it('treats an empty value as unset', () => {
    process.env.SIMILARITY_WORKER_URL = '';

    expect(similarityWorkerUnset()).toBe(true);
  });

  // The documented production value for MODEL_WORKER_URL is empty: no local
  // text-generation endpoint. Warning about it would fire on every correctly
  // configured deployment, so it must not.
  it('ignores an unset MODEL_WORKER_URL', () => {
    delete process.env.MODEL_WORKER_URL;
    process.env.SIMILARITY_WORKER_URL = 'http://models:8002';

    expect(similarityWorkerUnset()).toBe(false);
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
