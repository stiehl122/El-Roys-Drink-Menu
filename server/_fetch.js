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

function cancelReader(reader) {
  try {
    const cancelResult = reader?.cancel?.();
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

async function readStreamText(reader) {
  const decoder = new TextDecoder();
  let text = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk?.done) break;
      const value = chunk?.value;
      if (typeof value === 'string') text += value;
      else if (value !== undefined && value !== null) text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try {
      reader.releaseLock?.();
    } catch (_) {
      // Releasing can fail after cancellation; the reader has still been canceled.
    }
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
  const reader = response?.body?.getReader?.();
  if (reader) {
    return runWithTimeout(
      () => readStreamText(reader),
      {
        ...config,
        label: config.label || 'Response body',
        onTimeout: () => cancelReader(reader),
      }
    );
  }

  return runWithTimeout(
    () => response.text(),
    {
      ...config,
      label: config.label || 'Response body',
      onTimeout: () => cancelResponseBody(response),
    }
  );
}

async function readResponseJsonWithTimeout(response, config = {}) {
  if (response?.body?.getReader) {
    const text = await readResponseTextWithTimeout(response, config);
    return JSON.parse(text);
  }

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
