import {
  classifyKubernetesError,
  KubernetesApiError,
  statusOf,
} from './kubernetes-api.error';

describe('classifyKubernetesError', () => {
  it('keeps the status the API server answered with', () => {
    // What the client's own ApiException looks like.
    const failure = { code: 409, body: { message: 'shops "odeca" exists' } };

    const classified = classifyKubernetesError(failure);

    expect(classified.status).toBe(409);
    expect(classified.message).toBe('shops "odeca" exists');
  });

  it('reads a status body that arrived as JSON text', () => {
    const failure = {
      code: 422,
      body: '{"kind":"Status","message":"availability: unsupported value"}',
    };

    expect(classifyKubernetesError(failure).message).toBe(
      'availability: unsupported value',
    );
  });

  it('keeps a body that is not JSON at all', () => {
    const classified = classifyKubernetesError({ code: 500, body: 'boom' });

    expect(classified.message).toBe('boom');
  });

  it('leaves the status empty when the request never arrived', () => {
    // `fetch` reports a refused connection this way: the reason is one level
    // down, and there is no status because nothing answered.
    const failure = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });

    const classified = classifyKubernetesError(failure);

    expect(classified.status).toBeNull();
    expect(classified.message).toBe('ECONNREFUSED');
  });

  it('does not mistake an error code for a status', () => {
    const classified = classifyKubernetesError({ code: 'ENOTFOUND' });

    expect(classified.status).toBeNull();
  });

  it('carries an ordinary error through', () => {
    const classified = classifyKubernetesError(new Error('something broke'));

    expect(classified.status).toBeNull();
    expect(classified.message).toBe('something broke');
  });

  it('still says something when it was given nothing to go on', () => {
    expect(classifyKubernetesError({}).message).toBe(
      'the Kubernetes API call failed',
    );
  });

  it('keeps the original error as the cause', () => {
    const original = new Error('something broke');

    expect(classifyKubernetesError(original).cause).toBe(original);
  });

  it('leaves an already classified error alone', () => {
    const classified = new KubernetesApiError('gone', 404);

    expect(classifyKubernetesError(classified)).toBe(classified);
  });
});

describe('statusOf', () => {
  it('reports the status of a Kubernetes failure', () => {
    expect(statusOf(new KubernetesApiError('conflict', 409))).toBe(409);
  });

  it('reports nothing for any other error', () => {
    expect(statusOf(new Error('unrelated'))).toBeNull();
  });
});
