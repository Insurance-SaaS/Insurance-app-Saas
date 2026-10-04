// ─── Contracts Barrel Export ──────────────────────────────────────────
// All interfaces, tokens, and events in one import.

// Injection tokens
export * from './tokens';

// Plugin manifest & types
export * from './types/plugin-manifest';

// Service interfaces
export * from './interfaces/i-cache.service';
export * from './interfaces/i-storage.service';
export * from './interfaces/i-otp.service';
export * from './interfaces/i-claims.service';
export * from './interfaces/i-quotes.service';
export * from './interfaces/i-users.service';
export * from './interfaces/i-plugin-registry.service';

// Domain events
export * from './events/domain-events';
