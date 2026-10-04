export function buildTenantCacheKey(tenantSlug: string, ...parts: string[]): string {
  const normalized = tenantSlug?.trim();
  if (!normalized) {
    // A tenant key without a tenant would be shared by everyone; refuse to build it.
    throw new Error('buildTenantCacheKey requires a tenant slug');
  }
  return `t:${normalized}:${parts.join(':')}`;
}

export function buildPlatformCacheKey(...parts: string[]): string {
  return `platform:${parts.join(':')}`;
}
