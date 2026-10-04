import * as tokens from 'src/contracts/tokens';
import { pluginId, PLUGIN_NAMESPACE } from 'src/contracts/types/plugin-manifest';

/**
 * The contracts layer: injection tokens and plugin ids.
 * Catches a duplicated token value or a changed namespace.
 */
describe('Token & Contract Wiring (integration)', () => {
  const ALL_TOKENS = Object.entries(tokens).map(([name, token]) => ({ name, token }));

  it('defines only tokens that have a provider', () => {
    expect(ALL_TOKENS.map((t) => t.name).sort()).toEqual([
      'CACHE_SERVICE',
      'CLAIMS_SERVICE',
      'OTP_SERVICE',
      'PLUGIN_REGISTRY',
      'QUOTES_SERVICE',
      'STORAGE_SERVICE',
      'USERS_SERVICE',
    ]);
  });

  it('all tokens are unique Symbols', () => {
    for (const { token } of ALL_TOKENS) {
      expect(typeof token).toBe('symbol');
    }
    expect(new Set(ALL_TOKENS.map((t) => t.token)).size).toBe(ALL_TOKENS.length);
  });

  it('token descriptions follow the I<Name>Service convention', () => {
    for (const { token } of ALL_TOKENS) {
      expect((token as symbol).description).toMatch(/^I[A-Z]\w+Service$/);
    }
  });

  it('PLUGIN_NAMESPACE is @insurance', () => {
    expect(PLUGIN_NAMESPACE).toBe('@insurance');
  });

  it('pluginId() normalises short names', () => {
    expect(pluginId('claims')).toBe('@insurance/claims');
    expect(pluginId('ai')).toBe('@insurance/ai');
  });

  it('pluginId() is idempotent for already-namespaced IDs', () => {
    expect(pluginId('@insurance/claims')).toBe('@insurance/claims');
    expect(pluginId(pluginId('claims'))).toBe('@insurance/claims');
  });
});
