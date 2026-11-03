const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const addonSource = fs.readFileSync(
  path.join(__dirname, "..", "lib", "p5.apriltag.js"),
  "utf8",
);

function loadAddon({ rgba = new Uint8ClampedArray([255, 0, 0, 255]) } = {}) {
  const drawCalls = [];
  const blobs = [];
  const workers = [];
  const objectUrls = [];
  let now = 1_000;
  let registeredAddon;

  class MockWorker {
    constructor(url) {
      this.url = url;
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }

    postMessage(message, transfer) {
      this.messages.push({ message, transfer });
    }

    terminate() {
      this.terminated = true;
    }
  }

  const context = {
    Blob: class MockBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        blobs.push(this);
      }
    },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    TextDecoder,
    Uint8Array,
    URL: {
      createObjectURL() {
        const url = `blob:test-${objectUrls.length}`;
        objectUrls.push(url);
        return url;
      },
      revokeObjectURL() {},
    },
    Worker: MockWorker,
    console: { error() {} },
    document: {
      createElement(name) {
        assert.equal(name, "canvas");
        return {
          getContext(type, options) {
            assert.equal(type, "2d");
            assert.equal(options.willReadFrequently, true);
            return {
              drawImage(...args) {
                drawCalls.push(args);
              },
              getImageData() {
                return { data: rgba };
              },
            };
          },
        };
      },
    },
    p5: {
      registerAddon(addon) {
        registeredAddon = addon;
      },
    },
    performance: { now: () => now },
  };

  vm.runInNewContext(addonSource, context, { filename: "p5.apriltag.js" });
  const fn = {};
  const lifecycles = {};
  registeredAddon(context.p5, fn, lifecycles);

  return {
    context,
    blobs,
    drawCalls,
    fn,
    lifecycles,
    objectUrls,
    setNow(value) {
      now = value;
    },
    workers,
  };
}

function makeVideo(width = 2, height = 1) {
  return { width, height, elt: { readyState: 2 } };
}

test("registers the factory, constructor, and remove lifecycle", () => {
  const harness = loadAddon();

  assert.equal(typeof harness.fn.createAprilTagDetector, "function");
  assert.equal(typeof harness.context.p5.AprilTagDetector, "function");
  assert.equal(typeof harness.lifecycles.remove, "function");
});

test("factory binds the sketch and creates a configured worker", () => {
  const harness = loadAddon();
  const sketch = {};
  const detector = harness.fn.createAprilTagDetector.call(sketch, makeVideo(), {
    width: 1,
    height: 1,
    detectionsPerSecond: 20,
  });

  assert.ok(detector instanceof harness.context.p5.AprilTagDetector);
  assert.equal(detector.width, 1);
  assert.equal(detector.height, 1);
  assert.equal(detector.interval, 50);
  assert.equal(harness.workers.length, 1);
  assert.match(harness.workers[0].url, /^blob:test-/);
  assert.deepEqual(Array.from(detector.families), [
    "tag36h11",
    "tag25h9",
    "tag16h5",
    "tagCircle21h7",
    "tagCircle49h12",
    "tagCustom48h12",
    "tagStandard41h12",
    "tagStandard52h13",
  ]);
  assert.equal(detector.hammingDistance, 0);
});

test("does not rate-limit detection by default", () => {
  const harness = loadAddon();
  const detector = harness.fn.createAprilTagDetector.call({}, makeVideo());

  assert.equal(detector.interval, 0);
});

test("configures one or several supported tag families", () => {
  const harness = loadAddon();
  const singleDetector = harness.fn.createAprilTagDetector.call({}, makeVideo(), {
    families: ["tag25h9"],
  });
  const detector = harness.fn.createAprilTagDetector.call({}, makeVideo(), {
    families: ["tagStandard41h12", "tagCircle49h12", "tagStandard41h12"],
    hammingDistance: 1,
    quadDecimate: 1,
  });
  const workerSource = harness.blobs[1].parts.join("");

  assert.deepEqual(Array.from(singleDetector.families), ["tag25h9"]);
  assert.deepEqual(Array.from(detector.families), [
    "tagStandard41h12",
    "tagCircle49h12",
  ]);
  assert.equal(detector.hammingDistance, 1);
  assert.match(workerSource, /AliAlimohamad\/apriltag-js@4359086c/);
  assert.match(workerSource, /"families":\["tagStandard41h12","tagCircle49h12"\]/);
  assert.match(workerSource, /"quadDecimate":1/);
});

test("rejects unsupported family and detector options", () => {
  const harness = loadAddon();
  const create = (options) => harness.fn.createAprilTagDetector.call({}, makeVideo(), options);

  assert.throws(() => create({ families: ["tagUnknown"] }), /Unsupported AprilTag family/);
  assert.throws(() => create({ families: "tag25h9" }), /non-empty array/);
  assert.throws(() => create({ families: [] }), /non-empty array/);
  assert.throws(() => create({ hammingDistance: 4 }), /integer from 0 through 3/);
  assert.throws(() => create({ maxDetections: 0 }), /positive integer/);
  assert.throws(() => create({ width: 0 }), /width and height must be positive integers/);
  assert.throws(() => create({ detectionsPerSecond: 0 }), /must be a positive number/);
  assert.throws(() => create({ quadDecimate: 0 }), /must be a positive number/);
  assert.throws(() => create({ refineEdges: 1 }), /must be boolean values/);
  assert.throws(() => create({ onReady: true }), /must be functions/);
});

test("generated worker initializes the selected families and detector parameters", async () => {
  const harness = loadAddon();
  harness.fn.createAprilTagDetector.call({}, makeVideo(), {
    families: ["tagStandard52h13", "tagCircle49h12"],
    hammingDistance: 0,
    refineEdges: false,
  });
  const calls = [];
  const messages = [];
  const module = {
    HEAPU8: new Uint8Array(1024),
    _free() {},
    _malloc(size) {
      calls.push(["malloc", size]);
      return calls.length === 1 ? 100 : 800;
    },
    cwrap(name) {
      return (...args) => {
        calls.push([name, ...args]);
        return 0;
      };
    },
    getValue() {
      return 0;
    },
  };
  const workerContext = {
    AprilTagWasm: async () => module,
    Uint8Array,
    importScripts(url) {
      calls.push(["importScripts", url]);
    },
    performance: { now: () => 10 },
    postMessage(message) {
      messages.push(message);
    },
  };

  vm.runInNewContext(harness.blobs[0].parts.join(""), workerContext);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.find((call) => call[0] === "initialize_detector"), [
    "initialize_detector",
    "tagStandard52h13",
    1,
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "add_family"), [
    "add_family",
    4,
    1,
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "set_detector_parameters"), [
    "set_detector_parameters",
    2,
    0,
    0,
    0.25,
    0,
  ]);
  assert.equal(messages.at(-1).type, "ready");
});

test("worker derives p5-compatible rotation from canonically ordered corners", async () => {
  const harness = loadAddon();
  harness.fn.createAprilTagDetector.call({}, makeVideo());
  const values = new Map([
    [100, 7],
    [104, 0],
    [108, 20],
    [112, 20],
    [116, 30], [120, 10],
    [124, 30], [128, 30],
    [132, 10], [136, 30],
    [140, 10], [144, 10],
    [148, 50],
    [152, 0],
    [156, -2.4],
  ]);
  const messages = [];
  let allocations = 0;
  const module = {
    HEAPU8: new Uint8Array(1024),
    _free() {},
    _malloc() {
      allocations += 1;
      return allocations === 1 ? 100 : 800;
    },
    cwrap(name) {
      if (name === "detect_tags") return () => 1;
      return () => 0;
    },
    getValue(offset) {
      return values.get(offset) ?? 0;
    },
  };
  const workerContext = {
    AprilTagWasm: async () => module,
    Math,
    Uint8Array,
    importScripts() {},
    performance: { now: () => 10 },
    postMessage(message) {
      messages.push(message);
    },
  };

  vm.runInNewContext(harness.blobs[0].parts.join(""), workerContext);
  await new Promise((resolve) => setImmediate(resolve));
  workerContext.onmessage({
    data: { type: "detect", gray: new Uint8Array([0]), width: 1, height: 1 },
  });

  const detection = messages.at(-1).value[0];
  assert.equal(detection.id, 7);
  assert.equal(detection.rotation, Math.PI / 2);
  assert.notEqual(detection.rotation, values.get(156));
  assert.ok(detection.rotation >= -Math.PI && detection.rotation <= Math.PI);
});

test("rejects values that are not p5 media elements", () => {
  const harness = loadAddon();

  assert.throws(
    () => harness.fn.createAprilTagDetector.call({}, {}),
    /expects a p5\.MediaElement video/,
  );
});

test("detect converts pixels to grayscale and returns the latest results", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const harness = loadAddon({ rgba });
  const video = makeVideo();
  const detector = harness.fn.createAprilTagDetector.call({}, video);
  const worker = harness.workers[0];

  worker.onmessage({ data: { type: "ready" } });
  assert.equal(detector.detect().length, 0);
  assert.equal(detector.busy, true);
  assert.equal(harness.drawCalls.length, 1);
  assert.deepEqual(harness.drawCalls[0], [video.elt, 0, 0, 2, 1]);
  assert.equal(worker.messages.length, 1);
  assert.deepEqual(Array.from(worker.messages[0].message.gray), [76, 149]);

  const detections = [{ id: 7, center: { x: 1, y: 1 }, corners: [] }];
  worker.onmessage({ data: { type: "detections", value: detections, processingTime: 4.5 } });
  assert.equal(detector.detections, detections);
  assert.equal(detector.processingTime, 4.5);
  assert.equal(detector.busy, false);
});

test("capture errors are reported without leaving the detector busy", () => {
  const harness = loadAddon();
  let receivedError;
  const detector = harness.fn.createAprilTagDetector.call({}, makeVideo(), {
    onError(error) {
      receivedError = error;
    },
  });
  const worker = harness.workers[0];
  detector.context.getImageData = () => {
    throw new Error("Canvas read failed");
  };

  worker.onmessage({ data: { type: "ready" } });
  assert.doesNotThrow(() => detector.detect());
  assert.equal(detector.busy, false);
  assert.match(detector.error.message, /Canvas read failed/);
  assert.equal(receivedError, detector.error);
  assert.equal(worker.messages.length, 0);
});

test("detect waits for video data, readiness, throttling, and pending work", () => {
  const harness = loadAddon();
  const video = makeVideo(1, 1);
  video.elt.readyState = 0;
  const detector = harness.fn.createAprilTagDetector.call({}, video, {
    detectionsPerSecond: 10,
  });
  const worker = harness.workers[0];

  detector.detect();
  assert.equal(worker.messages.length, 0);
  video.elt.readyState = 2;
  detector.detect();
  assert.equal(worker.messages.length, 0);

  worker.onmessage({ data: { type: "ready" } });
  detector.detect();
  detector.detect();
  assert.equal(worker.messages.length, 1);

  worker.onmessage({ data: { type: "detections", value: [] } });
  harness.setNow(1_050);
  detector.detect();
  assert.equal(worker.messages.length, 1);
  harness.setNow(1_100);
  detector.detect();
  assert.equal(worker.messages.length, 2);
});

test("worker callbacks expose readiness and errors", () => {
  const harness = loadAddon();
  let readyDetector;
  let receivedError;
  const detector = harness.fn.createAprilTagDetector.call({}, makeVideo(), {
    onReady(value) {
      readyDetector = value;
    },
    onError(error) {
      receivedError = error;
    },
  });
  const worker = harness.workers[0];

  worker.onmessage({ data: { type: "ready" } });
  assert.equal(readyDetector, detector);
  worker.onmessage({ data: { type: "error", value: "WASM failed" } });
  assert.match(detector.error.message, /WASM failed/);
  assert.equal(receivedError, detector.error);
});

test("manual and lifecycle removal terminate workers", () => {
  const harness = loadAddon();
  const sketch = {};
  const first = harness.fn.createAprilTagDetector.call(sketch, makeVideo());
  const second = harness.fn.createAprilTagDetector.call(sketch, makeVideo());

  first.remove();
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(first.worker, null);
  harness.lifecycles.remove.call(sketch);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(second.worker, null);
  assert.doesNotThrow(() => harness.lifecycles.remove.call(sketch));
});

test("sample tags match the pinned official AprilTag images", () => {
  const samples = [
    ["tag36_11_00000.png", 10, "48d811f770fc3595aaf5650a5fd8007843e7fece1f8fdcb94e0f113b4c9ed0c6"],
    ["tag25_09_00000.png", 9, "e83c7e911a9fa3bda232fd7176be5b080ef2b64d01724184b0ce50e17250ad1a"],
    ["tag16_05_00000.png", 8, "04dd4f53a6dbe78cd2c7bcb946711dfe428e6e5ea195cbb669c823d671c15872"],
    ["tag41_12_00000.png", 9, "ad5bc161c157634f05afcfd3cfba34334b9303609dd3afc9c000b86e031da02a"],
    ["tag52_13_00000.png", 10, "9358900c0f4512e3c8abd5bfae93e30234194c7c24f2cc9c90c2e64316a8829d"],
    ["tag21_07_00000.png", 9, "6aa5400c41d31447ee5db7212df3a772170c2037c21b1eccbb9bd7c607c3c8f5"],
    ["tag49_12_00000.png", 11, "b302da74f157026ef7ec35236472a321edce5154849e41860eb9281db2b56692"],
    ["tag48_12_00000.png", 10, "35dd540f4051c2aec61dcb619c05d6fcf711aa5e79da05cb4b2aa7a8d1900910"],
  ];

  for (const [filename, size, checksum] of samples) {
    const png = fs.readFileSync(
      path.join(__dirname, "..", "examples", "assets", "apriltag-imgs", filename),
    );
    assert.deepEqual(png.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(crypto.createHash("sha256").update(png).digest("hex"), checksum);
  }
});
