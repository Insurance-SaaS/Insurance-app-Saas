export default async function globalTeardown(): Promise<void> {
  const containers = (globalThis as any).__TEST_CONTAINERS__ ?? [];
  await Promise.all(containers.map((container: { stop(): Promise<unknown> }) => container.stop()));
}
