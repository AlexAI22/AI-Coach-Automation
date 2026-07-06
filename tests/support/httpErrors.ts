import { Page, Response } from '@playwright/test';

export type HttpError = { status: number; method: string; url: string };

export type WatchOptions = {
  /** Only collect responses whose URL contains this host fragment. */
  hostIncludes?: string;
  /** Return true for a (status, url) pair that should be tolerated (not reported). */
  allow?: (status: number, url: string) => boolean;
  /** Called for each tolerated error, e.g. to log it so it stays visible. */
  onAllowed?: (err: HttpError) => void;
};

/**
 * Starts collecting HTTP 4xx/5xx responses from the page. Returns a live array
 * that fills as responses arrive — assert it is empty after the flow.
 *
 * `hostIncludes` scopes collection to the app's own requests (default the AI
 * Coach host) so unrelated third-party/telemetry errors don't cause false
 * failures. `allow` tolerates known transient errors while still surfacing them
 * via `onAllowed`.
 */
export function watchHttpErrors(page: Page, opts: WatchOptions = {}): HttpError[] {
  const { hostIncludes = 'aicoach.insight.com', allow, onAllowed } = opts;
  const errors: HttpError[] = [];
  page.on('response', (res: Response) => {
    const status = res.status();
    const url = res.url();
    if (status < 400 || !url.includes(hostIncludes)) return;
    const err: HttpError = { status, method: res.request().method(), url };
    if (allow?.(status, url)) {
      onAllowed?.(err);
      return;
    }
    errors.push(err);
  });
  return errors;
}
