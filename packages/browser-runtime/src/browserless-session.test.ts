import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserlessSyntheticSession,
  createBrowserlessPortalSession,
} from './browserless-session.js';

const io = vi.hoisted(() => {
  const element = {
    evaluate: vi.fn(),
    click: vi.fn(),
    press: vi.fn(),
    type: vi.fn(),
    select: vi.fn(),
    dispose: vi.fn(),
  };
  const cdp = {
    on: vi.fn(),
    send: vi.fn<(method: string, params: unknown) => Promise<unknown>>(),
    detach: vi.fn(),
  };
  const page = {
    url: vi.fn(),
    isClosed: vi.fn(() => false),
    title: vi.fn(async () => 'Synthetic portal'),
    bringToFront: vi.fn(),
    setDefaultTimeout: vi.fn(),
    setContent: vi.fn(),
    setBypassServiceWorker: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn(),
    goto: vi.fn(),
    locator: vi.fn(),
    evaluate: vi.fn(),
    screenshot: vi.fn(),
    evaluateOnNewDocument: vi.fn(),
    $$: vi.fn(),
    createCDPSession: vi.fn(),
    frames: vi.fn(),
  };
  const browser = { on: vi.fn(), newPage: vi.fn(), close: vi.fn(), pages: vi.fn() };
  const socket = { close: vi.fn(), closed: Promise.resolve() };
  return {
    element,
    cdp,
    page,
    browser,
    socket,
    connect: vi.fn(),
    socketConnect: vi.fn(),
    lookup: vi.fn(),
  };
});
vi.mock('puppeteer-core', () => ({ default: { connect: io.connect } }));
vi.mock('./transport.js', () => ({ BrowserSocket: { connect: io.socketConnect } }));
vi.mock('node:dns/promises', () => ({ lookup: io.lookup }));

const config = {
  origin: 'https://production-sfo.browserless.io',
  token: 'synthetic-private-token',
  maximumSessionDurationMs: 120_000,
};
const viewer = 'https://production-sfo.browserless.io/live/index.html?i=synthetic';
beforeEach(() => {
  vi.resetAllMocks();
  io.socketConnect.mockResolvedValue(io.socket);
  io.connect.mockResolvedValue(io.browser);
  io.browser.newPage.mockResolvedValue(io.page);
  io.browser.pages.mockResolvedValue([io.page]);
  io.page.frames.mockReturnValue([io.page]);
  io.page.bringToFront.mockResolvedValue(undefined);
  io.page.url.mockReturnValue('https://payer.example/login');
  io.element.evaluate.mockResolvedValue({ visible: false });
  io.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  io.page.goto.mockResolvedValue({ status: () => 200 });
  io.page.locator.mockReturnValue({
    map: () => ({ wait: async (): Promise<string> => 'Synthetic page' }),
  });
  io.page.evaluate.mockResolvedValue(false);
  io.page.screenshot.mockResolvedValue('aW1hZ2U=');
  io.page.$$.mockResolvedValue([io.element]);
  io.page.createCDPSession.mockResolvedValue(io.cdp);
  io.cdp.send.mockResolvedValue({
    error: null,
    liveURL: viewer,
    liveURLId: 'synthetic',
    timeout: 10_000,
  });
});
describe('documented Browserless CDP control', () => {
  it('opens a portal privately and permits observation only after acknowledged handoff', async () => {
    const session = await createBrowserlessPortalSession(
      config,
      'https://payer.example/login',
      Date.now() + 90000
    );
    expect(io.page.setContent).not.toHaveBeenCalled();
    expect(io.page.setBypassServiceWorker).toHaveBeenCalledWith(true);
    expect(io.page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(io.page.goto).toHaveBeenCalledWith('https://payer.example/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'human_control' });
    await expect(session.watch()).rejects.toMatchObject({ code: 'human_control' });
    await session.startHumanControl();
    expect(io.cdp.send).toHaveBeenCalledWith(
      'Browserless.liveURL',
      expect.objectContaining({ interactable: true, resizable: true, showBrowserInterface: true })
    );
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'human_control',
    });
    await expect(session.execute({ kind: 'click', selector: '#submit' })).rejects.toMatchObject({
      code: 'human_control',
    });
    expect(io.page.screenshot).not.toHaveBeenCalled();
    expect(io.page.$$).not.toHaveBeenCalled();
    io.cdp.send.mockResolvedValueOnce({ error: null, liveURLId: 'synthetic' });
    await session.resumeAutomation();
    await expect(session.inspectComputer()).resolves.toHaveProperty('image');
    expect(io.page.evaluateOnNewDocument).not.toHaveBeenCalled();
    await expect(session.execute({ kind: 'inspect' })).resolves.toHaveProperty('image');
    await expect(session.execute({ kind: 'click', selector: '#submit' })).rejects.toMatchObject({
      code: 'dispatch_uncertain',
    });
    expect(io.element.click).not.toHaveBeenCalled();
    await session.stop();
  });
  it('binds shared portal work to its reviewed destination before opening the browser and after a sign-in redirect', async () => {
    const shared = { ...config, interactionOrigin: 'https://payer.example' };
    await expect(
      createBrowserlessPortalSession(shared, 'https://elsewhere.example/', Date.now() + 90000)
    ).rejects.toMatchObject({ code: 'invalid_action' });
    expect(io.socketConnect).not.toHaveBeenCalled();
    const session = await createBrowserlessPortalSession(
      shared,
      'https://payer.example/login',
      Date.now() + 90000
    );
    await session.startHumanControl();
    io.cdp.send.mockResolvedValueOnce({ error: null, liveURLId: 'synthetic' });
    await session.resumeAutomation();
    const screenshotsBeforeRedirect = io.page.screenshot.mock.calls.length;
    io.page.url.mockReturnValue('https://elsewhere.example/profile');
    await expect(session.inspectComputer()).rejects.toThrow();
    expect(io.page.screenshot).toHaveBeenCalledTimes(screenshotsBeforeRedirect);
    await session.stop();
  });
  it('withholds an observation when authentication remains in another frame or popup', async () => {
    const privateFrame = { evaluate: vi.fn(async () => true) };
    io.browser.pages.mockResolvedValue([
      io.page,
      { frames: (): (typeof privateFrame)[] => [privateFrame] },
    ]);
    const session = await createBrowserlessSyntheticSession(
      config,
      '<p>Public</p>',
      Date.now() + 90000
    );
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'read_failed',
    });
    expect(io.page.locator).not.toHaveBeenCalled();
    expect(io.page.screenshot).not.toHaveBeenCalled();
    await session.stop();
  });
  it('rejects private DNS before creating a browser and sanitizes unavailable DNS', async () => {
    io.lookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    await expect(
      createBrowserlessPortalSession(config, 'https://payer.example', Date.now() + 90000)
    ).rejects.toMatchObject({ code: 'invalid_action' });
    io.lookup.mockRejectedValue(new Error('private DNS diagnostic'));
    await expect(
      createBrowserlessPortalSession(config, 'https://payer.example', Date.now() + 90000)
    ).rejects.toMatchObject({ code: 'read_failed' });
    expect(io.socketConnect).not.toHaveBeenCalled();
  });
  it.each([null, { status: (): number => 503 }])(
    'closes an unsuccessful portal opening',
    async (response) => {
      io.page.goto.mockResolvedValue(response);
      await expect(
        createBrowserlessPortalSession(config, 'https://payer.example', Date.now() + 90000)
      ).rejects.toMatchObject({ code: 'dispatch_uncertain' });
      expect(io.browser.close).toHaveBeenCalledOnce();
      expect(io.socket.close).toHaveBeenCalledOnce();
    }
  );
  it.each(['click', 'fill', 'select'] as const)(
    'blocks %s before any element operation when authentication is still visible',
    async (kind) => {
      io.page.evaluate.mockResolvedValue(true);
      const session = await createBrowserlessSyntheticSession(
        config,
        '<form></form>',
        Date.now() + 90000
      );
      await expect(
        session.execute({
          kind,
          selector: '#private',
          ...(kind === 'click' ? {} : { value: 'synthetic' }),
        })
      ).rejects.toMatchObject({ code: 'dispatch_uncertain' });
      expect(io.page.$$).not.toHaveBeenCalled();
      expect(io.element.click).not.toHaveBeenCalled();
      expect(io.element.type).not.toHaveBeenCalled();
      expect(io.element.select).not.toHaveBeenCalled();
      expect(io.page.screenshot).not.toHaveBeenCalled();
      await session.stop();
    }
  );
  it('mints initial interactive control then confirms closure before a watch-only replacement', async () => {
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await session.startHumanControl();
    expect(io.cdp.send).toHaveBeenLastCalledWith(
      'Browserless.liveURL',
      expect.objectContaining({ interactable: true })
    );
    io.cdp.send.mockResolvedValueOnce({ error: null, liveURLId: 'synthetic' });
    expect(io.page.screenshot).not.toHaveBeenCalled();
    await session.resumeAutomation();
    expect(io.cdp.send.mock.calls.map((call) => call[0])).toEqual([
      'Browserless.liveURL',
      'Browserless.closeLiveURL',
      'Browserless.liveURL',
    ]);
    expect(io.cdp.send).toHaveBeenLastCalledWith(
      'Browserless.liveURL',
      expect.objectContaining({ interactable: false })
    );
    expect(io.page.screenshot).toHaveBeenCalledOnce();
    expect(io.cdp.send.mock.invocationCallOrder[1]).toBeLessThan(
      io.page.screenshot.mock.invocationCallOrder[0] ?? 0
    );
    expect(io.page.screenshot.mock.invocationCallOrder[0]).toBeLessThan(
      io.cdp.send.mock.invocationCallOrder[2] ?? 0
    );
    await session.stop();
  });
  it.each([
    { error: 'unknown viewer', liveURLId: 'synthetic' },
    { error: null, liveURLId: 'other' },
  ])('fails closed on a rejected or mismatched interactive revocation', async (response) => {
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await session.startHumanControl();
    io.cdp.send.mockResolvedValueOnce(response);
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(io.cdp.send).toHaveBeenCalledTimes(2);
    expect(io.page.screenshot).not.toHaveBeenCalled();
    await session.stop();
  });
  it('creates one owned connection, constrains synthetic content and fills without Locator retries', async () => {
    const session = await createBrowserlessSyntheticSession(
      config,
      '<input id="example">',
      Date.now() + 120_000
    );
    expect(io.socketConnect).toHaveBeenCalledTimes(1);
    const endpoint = new URL(String(io.socketConnect.mock.calls[0]?.[0]));
    expect(endpoint.origin).toBe('wss://production-sfo.browserless.io');
    expect(Number(endpoint.searchParams.get('timeout'))).toBeGreaterThan(119_000);
    expect(Number(endpoint.searchParams.get('timeout'))).toBeLessThanOrEqual(120_000);
    expect(io.page.setContent).toHaveBeenCalledWith(expect.stringContaining("form-action 'none'"));
    await expect(
      session.execute({ kind: 'fill', selector: '#example', value: 'Example' })
    ).resolves.toEqual({ text: 'Synthetic page', image: 'data:image/jpeg;base64,aW1hZ2U=' });
    expect(io.element.click).toHaveBeenCalledWith({ count: 3 });
    expect(io.element.press).toHaveBeenCalledWith('Backspace');
    expect(io.element.type).toHaveBeenCalledOnce();
    expect(io.element.dispose).toHaveBeenCalledOnce();
    await session.stop();
    expect(io.browser.close).toHaveBeenCalledOnce();
    expect(io.socket.close).toHaveBeenCalledOnce();
  });
  it.each(['click', 'select'] as const)('performs %s once', async (kind) => {
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await session.execute({
      kind,
      selector: '#test',
      ...(kind === 'select' ? { value: 'test' } : {}),
    });
    expect(kind === 'select' ? io.element.select : io.element.click).toHaveBeenCalledOnce();
    await session.stop();
  });
  it('creates a strictly watch-only same-page viewer and retains its applied lifetime', async () => {
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    const receipt = await session.watch();
    expect(receipt.liveURL).toBe(viewer);
    expect(receipt.notAfter).toBeLessThanOrEqual(Date.now() + 10_000);
    expect(io.cdp.send).toHaveBeenCalledWith(
      'Browserless.liveURL',
      expect.objectContaining({ interactable: false, resizable: true, showBrowserInterface: true })
    );
    expect(io.cdp.detach).toHaveBeenCalledOnce();
    await session.stop();
  });
  it.each([
    'https://evil.example/live/index.html?i=synthetic',
    'https://production-sfo.browserless.io/e/route/account?i=synthetic',
    'https://production-sfo.browserless.io/e/route%2Fother/live/index.html?i=synthetic',
    'https://production-sfo.browserless.io/e/route/other/live/index.html?i=synthetic',
    `${viewer}&token=secret`,
    `${viewer}&i=duplicate`,
    `${viewer}#fragment`,
    'https://user@production-sfo.browserless.io/live/index.html?i=synthetic',
    `${viewer}&secret=synthetic-private-token`,
    `${viewer}&secret=synthetic%2Dprivate%2Dtoken`,
    'https://production-sfo.browserless.io/account?i=synthetic',
  ])('withholds invalid or credential-bearing viewer routing', async (url) => {
    io.cdp.send.mockResolvedValue({
      error: null,
      liveURL: url,
      liveURLId: 'synthetic',
      timeout: 1000,
    });
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await expect(session.watch()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    await session.stop();
  });
  it('preserves the cloud-returned opaque route rather than constructing a root URL', async () => {
    const routed =
      'https://production-sfo.browserless.io/e/synthetic-route/live/index.html?i=synthetic&t=10000&showBrowserInterface=true';
    io.cdp.send.mockResolvedValue({
      error: null,
      liveURL: routed,
      liveURLId: 'synthetic',
      timeout: 10000,
    });
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90000
    );
    expect((await session.watch()).liveURL).toBe(routed);
    await session.stop();
  });
  it.each([
    { error: 'provider private error' },
    { error: null, liveURL: viewer, liveURLId: 'synthetic', timeout: 999_999 },
  ])('rejects provider failure or an extended viewer deadline', async (value) => {
    io.cdp.send.mockResolvedValue(value);
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await expect(session.watch()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    await session.stop();
  });
  it('disposes ambiguous matches without acting', async () => {
    io.page.$$.mockResolvedValue([io.element, io.element]);
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await expect(session.execute({ kind: 'click', selector: 'button' })).rejects.toMatchObject({
      code: 'dispatch_uncertain',
    });
    expect(io.element.click).not.toHaveBeenCalled();
    expect(io.element.dispose).toHaveBeenCalledTimes(2);
    await session.stop();
  });
  it('bounds image output', async () => {
    io.page.screenshot.mockResolvedValue('x'.repeat(3_500_001));
    const session = await createBrowserlessSyntheticSession(
      config,
      '<form></form>',
      Date.now() + 90_000
    );
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'read_failed',
    });
    await session.stop();
  });
  it.each([
    { ...config, origin: 'https://evil.example' },
    { ...config, token: '' },
  ])('rejects unconfigured routing before connecting', async (value) => {
    await expect(
      createBrowserlessSyntheticSession(value, '<form></form>', Date.now() + 90_000)
    ).rejects.toMatchObject({ code: 'invalid_action' });
    expect(io.socketConnect).not.toHaveBeenCalled();
  });
  it('rejects elapsed or invalid content before connecting', async () => {
    await expect(
      createBrowserlessSyntheticSession(config, '<form></form>', Date.now() - 1)
    ).rejects.toMatchObject({ code: 'ended' });
    await expect(createBrowserlessSyntheticSession(config, '', Infinity)).rejects.toMatchObject({
      code: 'invalid_action',
    });
    expect(io.socketConnect).not.toHaveBeenCalled();
  });
  it('settles a failed initialization and hides provider error details', async () => {
    io.page.setContent.mockRejectedValue(new Error('private diagnostic with token'));
    io.browser.close.mockRejectedValue(new Error('private close error'));
    await expect(
      createBrowserlessSyntheticSession(config, '<form></form>', Date.now() + 90_000)
    ).rejects.toThrow('Browser session: dispatch_uncertain');
    expect(io.socket.close).toHaveBeenCalledOnce();
  });
  it('settles the owned socket when Puppeteer initialization fails', async () => {
    io.connect.mockRejectedValue(new Error('private'));
    await expect(
      createBrowserlessSyntheticSession(config, '<form></form>', Date.now() + 90_000)
    ).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(io.socket.close).toHaveBeenCalledOnce();
  });
});
