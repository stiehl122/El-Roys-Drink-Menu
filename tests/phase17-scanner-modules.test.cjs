const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createElement,
  createFetchResponse,
  loadSandboxWithScripts,
} = require('./helpers/runtime.cjs');

async function settleAsync() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

test('open food facts lookup returns a normalized product payload', async () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/open-food-facts.js'], {
    fetch: async () => createFetchResponse(200, {
      status: 1,
      product: {
        product_name: 'Topo Chico',
        brands: 'Coca-Cola',
        quantity: '355 ml',
      },
    }),
  });

  const result = await sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct('02113642');

  assert.equal(result.name, 'Topo Chico');
  assert.equal(result.description, 'Coca-Cola • 355 ml');
});

test('open food facts lookup returns null for unknown products and network failures', async () => {
  const unknownSandbox = loadSandboxWithScripts(['core/ui/manager/open-food-facts.js'], {
    fetch: async () => createFetchResponse(404, { status: 0 }),
  });
  const failedSandbox = loadSandboxWithScripts(['core/ui/manager/open-food-facts.js'], {
    fetch: async () => { throw new Error('offline'); },
  });

  assert.equal(await unknownSandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct('0000'), null);
  assert.equal(await failedSandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct('0000'), null);
});

test('barcode scanner prefers the native BarcodeDetector path and releases the stream after detection', async () => {
  let trackStopCount = 0;
  const stream = {
    getTracks() {
      return [{ stop() { trackStopCount += 1; } }];
    },
  };
  const sandbox = loadSandboxWithScripts(['core/ui/manager/barcode-scanner.js'], {
    navigator: {
      mediaDevices: {
        getUserMedia: async () => stream,
      },
    },
    requestAnimationFrame: cb => {
      cb();
      return 1;
    },
    cancelAnimationFrame() {},
  });

  class MockBarcodeDetector {
    async detect() {
      return [{ rawValue: '012345678905' }];
    }
  }

  const video = createElement('video', 'scanner-video');
  video.play = async () => {};
  const detected = [];
  const service = sandbox.__HF_UI_MODULES__.createBarcodeScannerService({
    BarcodeDetectorCtor: MockBarcodeDetector,
    navigator: sandbox.navigator,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
  });

  const startResult = await service.start(video, {
    onDetect: barcode => detected.push(barcode),
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(startResult.ok, true);
  assert.equal(startResult.mode, 'native');
  assert.deepEqual(detected, ['012345678905']);
  assert.equal(trackStopCount, 1);
  assert.equal(video.srcObject, null);
});

test('barcode scanner falls back to ZXing and signals unsupported when neither path is available', async () => {
  let zxingStopCount = 0;
  const sandbox = loadSandboxWithScripts(['core/ui/manager/barcode-scanner.js']);
  const video = createElement('video', 'scanner-video');
  const detected = [];

  const zxingService = sandbox.__HF_UI_MODULES__.createBarcodeScannerService({
    loadZXingLibrary: async () => ({
      BrowserMultiFormatReader: class BrowserMultiFormatReader {
        async decodeFromConstraints(_constraints, _video, callback) {
          setTimeout(() => {
            callback({ getText: () => '750000000001' }, null, {
              stop() { zxingStopCount += 1; },
            });
          }, 0);
          return {
            stop() { zxingStopCount += 1; },
          };
        }
      },
    }),
  });

  const zxingResult = await zxingService.start(video, {
    onDetect: barcode => detected.push(barcode),
  });
  await settleAsync();

  const unsupportedService = sandbox.__HF_UI_MODULES__.createBarcodeScannerService({
    loadZXingLibrary: async () => null,
  });
  const unsupportedResult = await unsupportedService.start(video, {});

  assert.equal(zxingResult.ok, true);
  assert.equal(zxingResult.mode, 'zxing');
  assert.deepEqual(detected, ['750000000001']);
  assert.ok(zxingStopCount >= 1);
  assert.equal(unsupportedResult.ok, false);
  assert.equal(unsupportedResult.reason, 'unsupported');
});

test('barcode scanner emits nothing after stop is called', async () => {
  let queuedFrame = null;
  let trackStopCount = 0;
  const stream = {
    getTracks() {
      return [{ stop() { trackStopCount += 1; } }];
    },
  };
  const sandbox = loadSandboxWithScripts(['core/ui/manager/barcode-scanner.js'], {
    navigator: {
      mediaDevices: {
        getUserMedia: async () => stream,
      },
    },
    requestAnimationFrame: cb => {
      queuedFrame = cb;
      return 1;
    },
    cancelAnimationFrame() {},
  });

  class DelayedBarcodeDetector {
    async detect() {
      return [{ rawValue: '111111111111' }];
    }
  }

  const detected = [];
  const service = sandbox.__HF_UI_MODULES__.createBarcodeScannerService({
    BarcodeDetectorCtor: DelayedBarcodeDetector,
    navigator: sandbox.navigator,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
  });

  await service.start(createElement('video', 'scanner-video'), {
    onDetect: barcode => detected.push(barcode),
  });
  await service.stop();
  if (queuedFrame) queuedFrame();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(detected, []);
  assert.equal(trackStopCount, 1);
});
