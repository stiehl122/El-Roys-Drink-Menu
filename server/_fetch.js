async function fetchWithTimeout(url, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs || 8000);
  const fetchImpl = config.fetchImpl || fetch;
  const controller = new AbortController();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const fetchPromise = fetchImpl(url, {
    ...options,
    signal: options.signal || controller.signal,
  }).catch(error => {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { fetchWithTimeout };
