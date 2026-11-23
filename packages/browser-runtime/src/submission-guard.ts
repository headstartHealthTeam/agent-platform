/** Installed only after private login ends, including subsequent documents/frames. */
export function disableFormSubmission(): void {
  // A blocked page postback must remain observable without retaining its fields or payload.
  const previous: unknown = Object.getOwnPropertyDescriptor(
    document,
    '__headstartBlockedForms'
  )?.value;
  function isCounts(
    value: unknown
  ): value is { event: number; submit: number; requestSubmit: number } {
    return (
      value !== null &&
      typeof value === 'object' &&
      'event' in value &&
      typeof value.event === 'number' &&
      'submit' in value &&
      typeof value.submit === 'number' &&
      'requestSubmit' in value &&
      typeof value.requestSubmit === 'number'
    );
  }
  const blocked = isCounts(previous) ? previous : { event: 0, submit: 0, requestSubmit: 0 };
  const guards = Object.freeze({
    submit: () => {
      blocked.submit++;
      throw new Error('Application submission is disabled for this browser session');
    },
    requestSubmit: () => {
      blocked.requestSubmit++;
      throw new Error('Application submission is disabled for this browser session');
    },
  });
  const priorGuards: unknown = Object.getOwnPropertyDescriptor(
    document,
    '__headstartFormGuards'
  )?.value;
  for (const [name, guard] of Object.entries(guards)) {
    const existing = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, name);
    if (existing?.configurable !== false) continue;
    const installed: unknown =
      priorGuards !== null && typeof priorGuards === 'object'
        ? Object.getOwnPropertyDescriptor(priorGuards, name)?.value
        : undefined;
    if (
      typeof installed !== 'function' ||
      existing.value !== installed ||
      existing.writable !== false ||
      Function.prototype.toString.call(installed) !== Function.prototype.toString.call(guard)
    )
      throw new Error('Cannot establish the form submission guard');
  }
  if (priorGuards === undefined) {
    Object.defineProperty(document, '__headstartFormGuards', { value: guards });
  }
  if (!Object.getOwnPropertyDescriptor(document, '__headstartBlockedForms'))
    Object.defineProperty(document, '__headstartBlockedForms', {
      value: blocked,
      configurable: false,
    });
  document.addEventListener(
    'submit',
    (event) => {
      const alreadyPrevented = event.defaultPrevented;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        if (!alreadyPrevented) blocked.event++;
      } catch {
        /* Untrusted document diagnostics must never weaken prevention. */
      }
    },
    true
  );
  for (const [name, guard] of Object.entries(guards)) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, name);
    if (descriptor?.configurable === false) continue;
    Object.defineProperty(HTMLFormElement.prototype, name, {
      configurable: false,
      writable: false,
      value: guard,
    });
  }
}

/** Counts only; never read form values, hidden state, handlers, or destination URLs. */
export function blockedFormCounts(): { event: number; submit: number; requestSubmit: number } {
  const counts: unknown = Object.getOwnPropertyDescriptor(
    document,
    '__headstartBlockedForms'
  )?.value;
  if (
    counts !== null &&
    typeof counts === 'object' &&
    'event' in counts &&
    Number.isSafeInteger(counts.event) &&
    'submit' in counts &&
    Number.isSafeInteger(counts.submit) &&
    'requestSubmit' in counts &&
    Number.isSafeInteger(counts.requestSubmit)
  ) {
    return {
      event: typeof counts.event === 'number' ? counts.event : 0,
      submit: typeof counts.submit === 'number' ? counts.submit : 0,
      requestSubmit: typeof counts.requestSubmit === 'number' ? counts.requestSubmit : 0,
    };
  }
  return { event: 0, submit: 0, requestSubmit: 0 };
}
