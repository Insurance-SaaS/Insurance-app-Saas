import { ClaimStatusChangedEvent } from 'src/contracts/events/domain-events';
import { ClaimNotificationListener } from './claim-notification.listener';

describe('ClaimNotificationListener', () => {
  const fcmMock = { isInitialized: jest.fn(() => true), sendToUser: jest.fn() };
  const runnerMock = { run: jest.fn((_slug: string, work: () => Promise<unknown>) => work()) };
  const contextMock = { isPluginEnabled: jest.fn() };

  const event = new ClaimStatusChangedEvent({
    claimId: 'c1',
    userId: 'u1',
    oldStatus: 'SUBMITTED',
    newStatus: 'APPROVED',
    numDossier: 'CLM-1',
    tenantSlug: 'acme',
  });

  let listener: ClaimNotificationListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new ClaimNotificationListener(fcmMock as any, runnerMock as any, contextMock as any);
  });

  it('acts as the tenant named by the event', async () => {
    contextMock.isPluginEnabled.mockReturnValue(true);

    await listener.handleClaimStatusChanged(event);

    expect(runnerMock.run).toHaveBeenCalledWith('acme', expect.any(Function));
    expect(fcmMock.sendToUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: expect.any(String) }),
      expect.objectContaining({ sinisterId: 'c1', status: 'APPROVED' }),
      expect.objectContaining({ referenceId: 'c1' }),
    );
  });

  it('sends nothing when notifications are disabled for that tenant', async () => {
    contextMock.isPluginEnabled.mockReturnValue(false);

    await listener.handleClaimStatusChanged(event);

    expect(contextMock.isPluginEnabled).toHaveBeenCalledWith('@insurance/notifications');
    expect(fcmMock.sendToUser).not.toHaveBeenCalled();
  });

  it('never lets a failure reach the code that emitted the event', async () => {
    runnerMock.run.mockRejectedValueOnce(new Error('tenant gone'));

    await expect(listener.handleClaimStatusChanged(event)).resolves.toBeUndefined();
  });
});
