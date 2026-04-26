async function fetchWithTimeout(url, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs || 8000);
  const fetchImpl = config.fetchImpl || fetch;
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timeoutId;
  let timedOut = false;
  let callerAbortHandler = null;

  const timeoutError = () => new Error(`Request timed out after ${timeoutMs}ms`);

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

  const fetchPromise = fetchImpl(url, {
    ...options,
    signal: controller.signal,
  }).catch(error => {
    if (timedOut && error?.name === 'AbortError') {
      throw timeoutError();
    }
    throw error;
  });

  try {
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

module.exports = { fetchWithTimeout };
