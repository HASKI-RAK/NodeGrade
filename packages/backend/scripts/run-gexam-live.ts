import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
});

const key = process.env.NODEGRADE_GEXAM_INTERNAL_API_KEY;
if (!key) throw new Error('NODEGRADE_GEXAM_INTERNAL_API_KEY is missing.');

const baseUrl =
  process.env.NODEGRADE_BASE_URL ??
  `http://localhost:${process.env.NODEGRADE_BACKEND_PORT ?? '5000'}`;

const question = [
  'Eine neue Garagentor-Steuerung erwartet isBlocked(): boolean.',
  'Ein vorhandener Sensor liefert readDistance(): number in Zentimetern.',
  'Bei weniger als 20 cm gilt die Tür als blockiert.',
  'Beschreibe eine Integration mit einem Entwurfsmuster und begründe deine Entscheidung.',
].join(' ');

const rubricCriteria = [
  {
    id: 'pattern',
    description:
      '0: kein passendes Muster; 1: Adapter genannt ohne klare Rolle; 2: Adapter als Schnittstellenübersetzer richtig erklärt.',
    maxPoints: 2,
  },
  {
    id: 'delegation',
    description:
      '0: keine Delegation; 1: Sensoraufruf vage; 2: Adapter implementiert isBlocked() und delegiert an readDistance().',
    maxPoints: 2,
  },
  {
    id: 'boundary',
    description:
      '0: Schwelle falsch; 1: Schwelle genannt ohne Grenzfall; 2: <20 cm ist true, genau 20 cm und mehr false.',
    maxPoints: 2,
  },
].map((criterion) => ({
  ...criterion,
  levels: [
    { points: 0, description: 'Criterion not met.' },
    { points: 1, description: 'Criterion partly met.' },
    { points: 2, description: 'Criterion fully met.' },
  ],
}));

const cases = [
  {
    name: 'well-supported',
    answer:
      'Ich verwende einen Adapter, der isBlocked() implementiert und intern readDistance() des alten Sensors aufruft. Der Adapter gibt true zurück, wenn der Abstand kleiner als 20 cm ist; bei genau 20 cm oder mehr false. So kann die neue Steuerung die erwartete Schnittstelle verwenden, ohne den Sensor zu ändern.',
  },
  {
    name: 'partial',
    answer:
      'Ich würde einen Adapter nutzen. Er ruft den alten Sensor auf und gibt eine passende Antwort für die neue Steuerung zurück.',
  },
  {
    name: 'incorrect',
    answer:
      'Ein Singleton speichert den Sensor. Die Tür ist blockiert, wenn der Abstand größer als 20 cm ist.',
  },
];

type Status = {
  evaluationId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  criterionResults?: {
    criterionId: string;
    proposedPoints: number;
    maxPoints: number;
    evidenceExcerpt: string;
  }[];
  totalPoints?: number;
  maxPoints?: number;
  reviewFlag?: boolean;
  classification?: 'correct' | 'partially_correct' | 'incorrect';
  feedback?: { strengths: string; nextSteps: string };
  model?: { providerKey: string; modelId: string };
  error?: { code: string; message: string };
};

async function readStatus(id: string): Promise<Status> {
  const response = await fetch(`${baseUrl}/api/internal/evaluations/${id}`, {
    headers: { 'X-Internal-Api-Key': key! },
  });
  if (!response.ok)
    throw new Error(`Evaluation GET returned HTTP ${response.status}.`);
  return (await response.json()) as Status;
}

async function runCase(name: string, answer: string): Promise<void> {
  const id = randomUUID();
  const body = {
    externalAttemptId: `live-${id}`,
    taskVersionId: 'softwaretechnik-demo-v1:adapter',
    workflowRevision: 'gexam-rubric-v1',
    question,
    learningOutcome:
      'Kann einen Schnittstellenkonflikt erkennen und das Adaptermuster mit korrekt behandeltem Grenzfall anwenden.',
    answer,
    referenceAnswer:
      'Ein Adapter implementiert isBlocked(), ruft readDistance() auf und gibt für Werte unter 20 cm true, sonst false zurück.',
    rubricCriteria,
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Api-Key': key!,
    'Idempotency-Key': `gexam-live-${id}`,
  };
  const posted = await fetch(`${baseUrl}/api/internal/evaluations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (posted.status !== 202)
    throw new Error(`${name}: POST returned HTTP ${posted.status}.`);
  const initial = (await posted.json()) as Status;
  const deadline = Date.now() + 180_000;
  let result = initial;
  while (result.status === 'PENDING' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await readStatus(initial.evaluationId);
  }
  if (result.status !== 'COMPLETED' || !result.criterionResults)
    throw new Error(
      `${name}: ${result.status} ${result.error?.code ?? 'TIMEOUT'} ${result.error?.message ?? ''}`,
    );
  if (result.criterionResults.length !== rubricCriteria.length)
    throw new Error(`${name}: missing criterion result.`);
  if (!result.feedback?.nextSteps || !result.classification)
    throw new Error(`${name}: missing classification or formative feedback.`);
  if (
    result.criterionResults.some(
      (criterion) =>
        criterion.proposedPoints < 0 ||
        criterion.proposedPoints > criterion.maxPoints ||
        (criterion.evidenceExcerpt !== '' &&
          !answer.includes(criterion.evidenceExcerpt)),
    )
  )
    throw new Error(`${name}: invalid criterion points or evidence.`);
  const replay = await fetch(`${baseUrl}/api/internal/evaluations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const replayed = (await replay.json()) as Status;
  if (replayed.evaluationId !== initial.evaluationId)
    throw new Error(`${name}: idempotency replay created a second evaluation.`);
  const changed = await fetch(`${baseUrl}/api/internal/evaluations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, answer: `${answer} changed` }),
  });
  if (changed.status !== 409)
    throw new Error(
      `${name}: changed payload did not produce idempotency conflict.`,
    );
  console.log(
    JSON.stringify({
      case: name,
      evaluationId: result.evaluationId,
      model: result.model?.modelId,
      total: `${result.totalPoints}/${result.maxPoints}`,
      criteria: result.criterionResults.map(
        (criterion) =>
          `${criterion.criterionId}:${criterion.proposedPoints}/${criterion.maxPoints}`,
      ),
      reviewFlag: result.reviewFlag,
      classification: result.classification,
    }),
  );
}

const unauthorized = await fetch(`${baseUrl}/api/internal/evaluations/missing`);
if (unauthorized.status !== 401)
  throw new Error(
    'The internal evaluation API accepted an unauthenticated read.',
  );

for (const item of cases) await runCase(item.name, item.answer);
