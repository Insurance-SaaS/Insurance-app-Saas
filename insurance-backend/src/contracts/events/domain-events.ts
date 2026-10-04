/**
 * Domain events: how one module tells others that something happened, without
 * importing them. The emitter publishes a typed event; listeners subscribe with
 * @OnEvent(SomeEvent.key).
 *
 * Only events that are both emitted and handled are defined. Add a class here
 * when a module actually needs to react to something.
 *
 * Naming: <Entity><PastTenseVerb>Event, key "<domain>.<action>".
 * Every event carries the tenant slug: listeners run outside the HTTP request
 * that caused them and must restore the tenant from the event.
 */

export class ClaimStatusChangedEvent {
  static readonly key = 'claim.status.changed';
  constructor(
    public readonly data: {
      claimId: string;
      userId: string;
      oldStatus: string;
      newStatus: string;
      numDossier: string;
      expertFullName?: string;
      userLanguage?: string;
      tenantSlug: string;
    },
  ) {}
}
