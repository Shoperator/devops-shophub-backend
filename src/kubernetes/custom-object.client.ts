/** Where a namespaced custom resource lives in the API server. */
export interface CustomResourceRef {
  group: string;
  version: string;
  namespace: string;
  /** Lowercase plural kind, same as in the CRD and in the REST path. */
  plural: string;
  name: string;
}

/** A custom resource in the shape the API server accepts. */
export interface CustomResource {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace: string };
  spec: Record<string, unknown>;
}

/**
 * Everything ShopHub needs from the Kubernetes API, and the only way it is
 * allowed to reach it. Keeping the SDK behind this interface means the services
 * above can be tested against a fake, and the one implementation that talks to
 * a real cluster stays in a single file.
 *
 * Failures arrive as `KubernetesApiError`, so callers can react to a status
 * without knowing anything about the transport.
 */
export interface CustomObjectClient {
  create(ref: CustomResourceRef, resource: CustomResource): Promise<void>;

  /** Merges `spec` into the stored resource, leaving other out. */
  patch(ref: CustomResourceRef, spec: Record<string, unknown>): Promise<void>;

  delete(ref: CustomResourceRef): Promise<void>;
}

/** Injection token; the module decides which implementation answers to it. */
export const CUSTOM_OBJECT_CLIENT = Symbol('CUSTOM_OBJECT_CLIENT');
