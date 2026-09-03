/**
 * A failed call to the Kubernetes API, reduced to the two things a caller can
 * act on: the status the API server answered with, and what it said.
 */
export class KubernetesApiError extends Error {
  /** HTTP status, or null when the API server never answered at all. */
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KubernetesApiError';
    this.status = status;
  }
}

/** The status of a Kubernetes failure, or null for anything else. */
export function statusOf(error: unknown): number | null {
  return error instanceof KubernetesApiError ? error.status : null;
}

/**
 * Pulls a status out of whatever the SDK threw.
 *
 * The client's own `ApiException` carries `code`, but a request that never
 * reached the API server throws something else entirely — so a missing status
 * is a meaningful answer, not a parse failure. Deliberately duck-typed: this
 * module must not import the SDK, which is ESM-only (see `kubernetes-sdk.ts`).
 */
function readStatus(error: unknown): number | null {
  const candidate = error as { code?: unknown; statusCode?: unknown };
  for (const value of [candidate?.code, candidate?.statusCode]) {
    // Connection failures put a string such as "ECONNREFUSED" in `code`.
    if (typeof value === 'number') {
      return value;
    }
  }
  return null;
}

/** The API server reports failures as a Status object with a message. */
function readBodyMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    try {
      return readBodyMessage(JSON.parse(body));
    } catch {
      return body.length > 0 ? body : null;
    }
  }
  if (typeof body === 'object' && body !== null) {
    const { message } = body as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return null;
}

function readMessage(error: unknown): string {
  const fromBody = readBodyMessage((error as { body?: unknown })?.body);
  if (fromBody !== null) {
    return fromBody;
  }

  // `fetch` reports a refused connection as a bare "fetch failed", with the
  // reason one level down, so the cause is worth more than the message.
  const cause = (error as { cause?: unknown })?.cause;
  const causeCode = (cause as { code?: unknown })?.code;
  if (typeof causeCode === 'string') {
    return causeCode;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'the Kubernetes API call failed';
}

/** Normalises anything the SDK throws into a `KubernetesApiError`. */
export function classifyKubernetesError(error: unknown): KubernetesApiError {
  if (error instanceof KubernetesApiError) {
    return error;
  }
  return new KubernetesApiError(readMessage(error), readStatus(error), {
    cause: error,
  });
}
