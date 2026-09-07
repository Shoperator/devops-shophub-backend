import { ConfigService } from '@nestjs/config';
import { DisabledCustomObjectClient } from './disabled-custom-object.client';
import {
  getKubernetesAuthMode,
  getKubernetesFieldManager,
  isKubernetesEnabled,
} from './kubernetes.config';
import { createCustomObjectClient } from './kubernetes.module';

function configOf(settings: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback: string) => settings[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('kubernetes configuration', () => {
  describe('isKubernetesEnabled', () => {
    it('stays off unless it is asked for', () => {
      expect(isKubernetesEnabled(configOf({}))).toBe(false);
    });

    it('is on for "true", and nothing else', () => {
      expect(
        isKubernetesEnabled(configOf({ KUBERNETES_ENABLED: 'true' })),
      ).toBe(true);
      expect(isKubernetesEnabled(configOf({ KUBERNETES_ENABLED: 'yes' }))).toBe(
        false,
      );
    });
  });

  describe('getKubernetesAuthMode', () => {
    it('decides for itself by default', () => {
      expect(getKubernetesAuthMode(configOf({}))).toBe('auto');
    });

    it('takes the mode it was given', () => {
      expect(
        getKubernetesAuthMode(configOf({ KUBERNETES_AUTH_MODE: 'in-cluster' })),
      ).toBe('in-cluster');
    });

    it('refuses a mode it does not have, rather than guessing', () => {
      expect(() =>
        getKubernetesAuthMode(configOf({ KUBERNETES_AUTH_MODE: 'sometimes' })),
      ).toThrow('KUBERNETES_AUTH_MODE');
    });
  });

  describe('getKubernetesFieldManager', () => {
    it('signs the writes as ShopHub by default', () => {
      expect(getKubernetesFieldManager(configOf({}))).toBe('shophub');
    });
  });
});

describe('createCustomObjectClient', () => {
  it('hands back the log-only client when Kubernetes is off', async () => {
    // The client package is ESM and this application is CommonJS, so it can
    // only be loaded dynamically. Returning before that import is what lets the
    // whole suite run without it.
    await expect(
      createCustomObjectClient(configOf({})),
    ).resolves.toBeInstanceOf(DisabledCustomObjectClient);
  });

  it('does not reach for a cluster it was told to ignore', async () => {
    const client = await createCustomObjectClient(configOf({}));

    await expect(
      client.delete({
        group: 'shop.shophub.local',
        version: 'v1',
        namespace: 'default',
        plural: 'shops',
        name: 'odeca-abc123',
      }),
    ).resolves.toBeUndefined();
  });
});
