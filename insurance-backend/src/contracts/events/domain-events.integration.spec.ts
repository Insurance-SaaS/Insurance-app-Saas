import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClaimStatusChangedEvent } from 'src/contracts/events/domain-events';

/**
 * The event bus, configured as in AppModule (wildcards, '.' delimiter).
 */
describe('Domain Event Bus (integration)', () => {
  let emitter: EventEmitter2;

  const statusChanged = (tenantSlug: string, claimId = 'c1') =>
    new ClaimStatusChangedEvent({
      claimId,
      userId: 'u1',
      oldStatus: 'SUBMITTED',
      newStatus: 'APPROVED',
      numDossier: 'CLM-1',
      tenantSlug,
    });

  beforeEach(() => {
    emitter = new EventEmitter2({ wildcard: true, delimiter: '.' });
  });

  it('event keys follow the domain.action convention', () => {
    expect(ClaimStatusChangedEvent.key).toMatch(/^[a-z]+(\.[a-z]+)+$/);
  });

  it('delivers the typed payload to a listener', (done) => {
    emitter.on(ClaimStatusChangedEvent.key, (event: ClaimStatusChangedEvent) => {
      expect(event).toBeInstanceOf(ClaimStatusChangedEvent);
      expect(event.data).toMatchObject({ claimId: 'c1', newStatus: 'APPROVED', tenantSlug: 'acme' });
      done();
    });

    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme'));
  });

  it('a wildcard listener sees every claim event', () => {
    const seen: string[] = [];
    emitter.on('claim.**', (event: ClaimStatusChangedEvent) => seen.push(event.data.claimId));

    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme', 'c1'));
    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme', 'c2'));

    expect(seen).toEqual(['c1', 'c2']);
  });

  it('every event names its tenant, so listeners never have to guess', () => {
    const slugs: string[] = [];
    emitter.on(ClaimStatusChangedEvent.key, (event: ClaimStatusChangedEvent) =>
      slugs.push(event.data.tenantSlug),
    );

    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme'));
    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('globex'));

    expect(slugs).toEqual(['acme', 'globex']);
  });

  it('emitting with no listeners does not throw', () => {
    expect(() => emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme'))).not.toThrow();
  });

  it('several listeners receive the same event', () => {
    const first = jest.fn();
    const second = jest.fn();
    emitter.on(ClaimStatusChangedEvent.key, first);
    emitter.on(ClaimStatusChangedEvent.key, second);

    emitter.emit(ClaimStatusChangedEvent.key, statusChanged('acme'));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
