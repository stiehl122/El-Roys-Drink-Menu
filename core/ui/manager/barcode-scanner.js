(function bootstrapBarcodeScanner(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  let _zxingLoadPromise = null;

  function cleanBarcodeValue(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function extractDetectedBarcode(result) {
    if (!result) return '';
    if (typeof result === 'string') return cleanBarcodeValue(result);
    if (typeof result.rawValue === 'string') return cleanBarcodeValue(result.rawValue);
    if (typeof result.text === 'string') return cleanBarcodeValue(result.text);
    if (typeof result.getText === 'function') return cleanBarcodeValue(result.getText());
    return '';
  }

  function stopStreamTracks(stream) {
    const tracks = stream && typeof stream.getTracks === 'function'
      ? stream.getTracks()
      : [];
    tracks.forEach(track => {
      if (track && typeof track.stop === 'function') track.stop();
    });
  }

  function getScriptHost(documentRef) {
    return documentRef?.head || documentRef?.body || documentRef?.documentElement || null;
  }

  function loadZXingBrowserLibrary(deps = {}) {
    if (deps.loadZXingLibrary && deps.loadZXingLibrary !== loadZXingBrowserLibrary) {
      return deps.loadZXingLibrary();
    }
    if (globalScope.ZXingBrowser) return Promise.resolve(globalScope.ZXingBrowser);
    if (_zxingLoadPromise) return _zxingLoadPromise;

    const documentRef = deps.document || globalScope.document;
    const scriptHost = getScriptHost(documentRef);
    if (!documentRef || typeof documentRef.createElement !== 'function' || !scriptHost || typeof scriptHost.appendChild !== 'function') {
      return Promise.resolve(null);
    }

    _zxingLoadPromise = new Promise(resolve => {
      const script = documentRef.createElement('script');
      script.async = true;
      script.src = '/vendor/zxing-browser.min.js';
      script.onload = () => resolve(globalScope.ZXingBrowser || null);
      script.onerror = () => resolve(null);
      scriptHost.appendChild(script);
    });

    return _zxingLoadPromise;
  }

  function createBarcodeScannerServiceImpl(deps = {}) {
    const navigatorRef = deps.navigator || globalScope.navigator || {};
    const requestFrame = typeof deps.requestAnimationFrame === 'function'
      ? deps.requestAnimationFrame
      : (typeof globalScope.requestAnimationFrame === 'function'
        ? globalScope.requestAnimationFrame.bind(globalScope)
        : (cb => globalScope.setTimeout(cb, 16)));
    const cancelFrame = typeof deps.cancelAnimationFrame === 'function'
      ? deps.cancelAnimationFrame
      : (typeof globalScope.cancelAnimationFrame === 'function'
        ? globalScope.cancelAnimationFrame.bind(globalScope)
        : (id => globalScope.clearTimeout(id)));

    let activeRunId = 0;
    let activeFrameId = null;
    let activeStream = null;
    let activeVideo = null;
    let zxingControls = null;
    let nativeDetector = null;

    function isRunCurrent(runId) {
      return runId && runId === activeRunId;
    }

    async function teardown() {
      if (activeFrameId != null) {
        cancelFrame(activeFrameId);
        activeFrameId = null;
      }
      if (zxingControls && typeof zxingControls.stop === 'function') {
        try { zxingControls.stop(); } catch (_) { /* ignore */ }
      }
      zxingControls = null;
      nativeDetector = null;
      if (activeStream) stopStreamTracks(activeStream);
      activeStream = null;
      if (activeVideo && Object.prototype.hasOwnProperty.call(activeVideo, 'srcObject')) {
        try { activeVideo.srcObject = null; } catch (_) { /* ignore */ }
      }
      activeVideo = null;
    }

    async function stop() {
      activeRunId += 1;
      await teardown();
      return { ok: true };
    }

    async function emitDetected(runId, barcode, onDetect) {
      if (!barcode || !isRunCurrent(runId)) return;
      await stop();
      if (typeof onDetect === 'function') onDetect(barcode);
    }

    async function startNativeScanner(runId, videoEl, onDetect, BarcodeDetectorCtor) {
      if (!navigatorRef?.mediaDevices?.getUserMedia) return { ok: false, reason: 'unsupported' };

      activeStream = await navigatorRef.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!isRunCurrent(runId)) {
        stopStreamTracks(activeStream);
        activeStream = null;
        return { ok: false, reason: 'stale' };
      }

      activeVideo = videoEl || null;
      if (activeVideo) {
        activeVideo.muted = true;
        activeVideo.autoplay = true;
        if (typeof activeVideo.setAttribute === 'function') activeVideo.setAttribute('playsinline', 'true');
        try { activeVideo.srcObject = activeStream; } catch (_) { /* ignore */ }
        if (typeof activeVideo.play === 'function') {
          try { await activeVideo.play(); } catch (_) { /* ignore */ }
        }
      }

      nativeDetector = new BarcodeDetectorCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
      });

      const tick = async () => {
        if (!isRunCurrent(runId) || !nativeDetector) return;
        let detections = [];
        try {
          detections = await nativeDetector.detect(activeVideo || videoEl);
        } catch (_) {
          detections = [];
        }
        if (!isRunCurrent(runId)) return;

        const barcode = extractDetectedBarcode(Array.isArray(detections) ? detections[0] : detections);
        if (barcode) {
          await emitDetected(runId, barcode, onDetect);
          return;
        }
        activeFrameId = requestFrame(() => {
          tick().catch(() => {});
        });
      };

      activeFrameId = requestFrame(() => {
        tick().catch(() => {});
      });
      return { ok: true, mode: 'native' };
    }

    async function startZxingScanner(runId, videoEl, onDetect) {
      const zxing = await loadZXingBrowserLibrary(deps);
      const ReaderCtor = zxing?.BrowserMultiFormatReader || zxing?.BrowserBarcodeReader;
      if (typeof ReaderCtor !== 'function') return { ok: false, reason: 'unsupported' };

      activeVideo = videoEl || null;
      if (activeVideo) {
        activeVideo.muted = true;
        activeVideo.autoplay = true;
        if (typeof activeVideo.setAttribute === 'function') activeVideo.setAttribute('playsinline', 'true');
      }

      const reader = new ReaderCtor();
      if (typeof reader.decodeFromConstraints !== 'function') return { ok: false, reason: 'unsupported' };

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        },
        activeVideo,
        (result, error, providedControls) => {
          void error;
          if (providedControls && !zxingControls) zxingControls = providedControls;
          const barcode = extractDetectedBarcode(result);
          if (!barcode || !isRunCurrent(runId)) return;
          emitDetected(runId, barcode, onDetect).catch(() => {});
        }
      );

      if (!isRunCurrent(runId)) {
        if (controls && typeof controls.stop === 'function') controls.stop();
        return { ok: false, reason: 'stale' };
      }

      zxingControls = controls || zxingControls;
      if (activeVideo?.srcObject) activeStream = activeVideo.srcObject;
      return { ok: true, mode: 'zxing' };
    }

    return {
      async start(videoEl, options = {}) {
        const onDetect = typeof options.onDetect === 'function' ? options.onDetect : null;
        await teardown();
        activeRunId += 1;
        const runId = activeRunId;

        const BarcodeDetectorCtor = Object.prototype.hasOwnProperty.call(deps, 'BarcodeDetectorCtor')
          ? deps.BarcodeDetectorCtor
          : globalScope.BarcodeDetector;
        if (typeof BarcodeDetectorCtor === 'function') {
          return startNativeScanner(runId, videoEl, onDetect, BarcodeDetectorCtor);
        }

        return startZxingScanner(runId, videoEl, onDetect);
      },
      stop,
    };
  }

  modules.createBarcodeScannerService = function createBarcodeScannerServiceBoundary(deps = {}) {
    return createBarcodeScannerServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
