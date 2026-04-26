function createTimeoutError(label, timeoutMs) {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

function cancelResponseBody(response) {
  try {
    const cancelResult = response?.body?.cancel?.();
    if (cancelResult && typeof cancelResult.catch === 'function') {
      cancelResult.catch(() => {});
    }
  } catch (_) {
    // Best-effort cleanup only; the timeout error is the user-facing result.
  }
}

async function runWithTimeout(operation, config = {}) {
  const timeoutMs = Number(config.timeoutMs || 8000);
  const label = config.label || 'Request';
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (typeof config.onTimeout === 'function') config.onTimeout();
      reject(createTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs || 8000);
  const fetchImpl = config.fetchImpl || fetch;
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timeoutId;
  let timedOut = false;
  let callerAbortHandler = null;

  const timeoutError = () => createTimeoutError('Request', timeoutMs);

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError());
    }, timeoutMs);
  });

  const callerAbortPromise = callerSignal ? new Promise((_, reject) => {
    callerAbortHandler = () => {
      if (!controller.signal.aborted) controller.abort(callerSignal.reason);
      if (callerSignal.reason instanceof Error) reject(callerSignal.reason);
      else {
        const error = new Error('Request aborted');
        error.name = 'AbortError';
        reject(error);
      }
    };

    if (callerSignal.aborted) callerAbortHandler();
    else callerSignal.addEventListener('abort', callerAbortHandler, { once: true });
  }) : null;

  try {
    const fetchPromise = Promise.resolve()
      .then(() => fetchImpl(url, {
        ...options,
        signal: controller.signal,
      }))
      .catch(error => {
        if (timedOut && error?.name === 'AbortError') {
          throw timeoutError();
        }
        throw error;
      });

    return await Promise.race(
      callerAbortPromise ? [fetchPromise, timeoutPromise, callerAbortPromise] : [fetchPromise, timeoutPromise]
    );
  } finally {
    clearTimeout(timeoutId);
    if (callerSignal && callerAbortHandler) {
      callerSignal.removeEventListener('abort', callerAbortHandler);
    }
  }
}

function readResponseTextWithTimeout(response, config = {}) {
  return runWithTimeout(
    () => response.text(),
    {
      ...config,
      label: config.label || 'Response body',
      onTimeout: () => cancelResponseBody(response),
    }
  );
}

function readResponseJsonWithTimeout(response, config = {}) {
  return runWithTimeout(
    () => response.json(),
    {
      ...config,
      label: config.label || 'Response body',
      onTimeout: () => cancelResponseBody(response),
    }
  );
}

module.exports = {
  fetchWithTimeout,
  readResponseJsonWithTimeout,
  readResponseTextWithTimeout,
};
