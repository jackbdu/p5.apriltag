/**
 * p5.apriltag.js
 * AprilTag detection addon for p5.js 2.x.
 *
 * Detector: AprilRobotics/apriltag via AliAlimohamad/apriltag-js.
 * Runtime dependencies are loaded from commit-pinned jsDelivr URLs.
 */
(function () {
  "use strict";

  const COMMIT = "4359086c430e44342098a464c359aacf00cf6bc8";
  const BASE = `https://cdn.jsdelivr.net/gh/AliAlimohamad/apriltag-js@${COMMIT}/js`;
  const TAG_FAMILIES = Object.freeze([
    "tag36h11",
    "tag25h9",
    "tag16h5",
    "tagCircle21h7",
    "tagCircle49h12",
    "tagCustom48h12",
    "tagStandard41h12",
    "tagStandard52h13",
  ]);
  const detectorsBySketch = new WeakMap();

  function finiteNumber(value, name, { positive = false } = {}) {
    if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) {
      throw new RangeError(`${name} must be ${positive ? "a positive" : "a finite"} number.`);
    }
    return value;
  }

  function detectorConfiguration(options) {
    const requestedFamilies = options.families ?? options.family ?? "tag36h11";
    const families = typeof requestedFamilies === "string" ? [requestedFamilies] : requestedFamilies;
    if (!Array.isArray(families) || families.length === 0) {
      throw new TypeError("family must be a tag family name, or families must be a non-empty array.");
    }

    const uniqueFamilies = [...new Set(families)];
    for (const family of uniqueFamilies) {
      if (!TAG_FAMILIES.includes(family)) {
        throw new RangeError(`Unsupported AprilTag family: ${family}`);
      }
    }

    const hammingDistance = options.hammingDistance ?? 0;
    if (!Number.isInteger(hammingDistance) || hammingDistance < 0 || hammingDistance > 3) {
      throw new RangeError("hammingDistance must be an integer from 0 through 3.");
    }

    const maxDetections = options.maxDetections ?? 100;
    if (!Number.isInteger(maxDetections) || maxDetections < 1) {
      throw new RangeError("maxDetections must be a positive integer.");
    }

    const quadDecimate = finiteNumber(options.quadDecimate ?? 2, "quadDecimate", {
      positive: true,
    });
    const quadSigma = finiteNumber(options.quadSigma ?? 0, "quadSigma");
    const decodeSharpening = finiteNumber(
      options.decodeSharpening ?? 0.25,
      "decodeSharpening",
    );
    const refineEdges = options.refineEdges ?? true;
    const debug = options.debug ?? false;
    if (typeof refineEdges !== "boolean" || typeof debug !== "boolean") {
      throw new TypeError("refineEdges and debug must be boolean values.");
    }

    return {
      families: uniqueFamilies,
      hammingDistance,
      maxDetections,
      parameters: {
        quadDecimate,
        quadSigma,
        refineEdges,
        decodeSharpening,
        debug,
      },
    };
  }

  function aprilTagAddon(p5, fn, lifecycles) {
    class AprilTagDetector {
      constructor(sketch, video, options = {}) {
        if (!video?.elt) throw new TypeError("createAprilTagDetector() expects a p5.MediaElement video.");

        this.video = video;
        this.width = options.width ?? (video.width || 640);
        this.height = options.height ?? (video.height || 480);
        if (!Number.isInteger(this.width) || this.width < 1 ||
            !Number.isInteger(this.height) || this.height < 1) {
          throw new RangeError("width and height must be positive integers.");
        }
        const detectionsPerSecond = finiteNumber(
          options.detectionsPerSecond ?? 12,
          "detectionsPerSecond",
          { positive: true },
        );
        this.interval = 1000 / detectionsPerSecond;
        this.detections = [];
        this.ready = false;
        this.busy = false;
        this.error = null;
        this.lastDetection = 0;
        this.onReady = options.onReady;
        this.onError = options.onError;
        if ((this.onReady !== undefined && typeof this.onReady !== "function") ||
            (this.onError !== undefined && typeof this.onError !== "function")) {
          throw new TypeError("onReady and onError must be functions.");
        }
        const configuration = detectorConfiguration(options);
        this.families = configuration.families;
        this.hammingDistance = configuration.hammingDistance;
        this.processingTime = 0;

        this.buffer = document.createElement("canvas");
        this.buffer.width = this.width;
        this.buffer.height = this.height;
        this.context = this.buffer.getContext("2d", { willReadFrequently: true });
        if (!this.context) throw new Error("Could not create a 2D canvas context for AprilTag detection.");

        const loaderUrl = options.loaderUrl ?? `${BASE}/apriltag_wasm.js`;
        const wasmUrl = options.wasmUrl ?? `${BASE}/apriltag_wasm.wasm`;
        const source = `(${aprilTagWorker})(${JSON.stringify(loaderUrl)}, ${JSON.stringify(wasmUrl)}, ${JSON.stringify(configuration)})`;
        const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          this.worker = new Worker(workerUrl);
        } finally {
          URL.revokeObjectURL(workerUrl);
        }
        this.worker.onmessage = ({ data }) => this.#receive(data);
        this.worker.onerror = (event) => this.#fail(event.message);

        let detectors = detectorsBySketch.get(sketch);
        if (!detectors) detectorsBySketch.set(sketch, (detectors = new Set()));
        detectors.add(this);
        this.detectors = detectors;
      }

      #receive(message) {
        if (message.type === "ready") {
          this.ready = true;
          this.onReady?.(this);
        } else if (message.type === "detections") {
          this.detections = message.value;
          this.processingTime = message.processingTime;
          this.busy = false;
        } else if (message.type === "error") {
          this.#fail(message.value);
        }
      }

      #fail(message) {
        this.busy = false;
        this.error = message instanceof Error ? message : new Error(String(message || "Unknown detector error."));
        console.error("p5.apriltag:", this.error);
        this.onError?.(this.error);
      }

      /** Schedule detection and return the most recently completed results. */
      detect() {
        if (this.video.elt.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return this.detections;
        const now = performance.now();
        if (!this.ready || this.busy || now - this.lastDetection < this.interval) return this.detections;
        this.busy = true;
        this.lastDetection = now;

        try {
          this.context.drawImage(this.video.elt, 0, 0, this.width, this.height);
          const rgba = this.context.getImageData(0, 0, this.width, this.height).data;
          const gray = new Uint8Array(this.width * this.height);
          for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
            gray[target] = (77 * rgba[source] + 150 * rgba[source + 1] + 29 * rgba[source + 2]) >> 8;
          }
          this.worker.postMessage(
            { type: "detect", gray, width: this.width, height: this.height },
            [gray.buffer],
          );
        } catch (error) {
          this.#fail(error);
        }
        return this.detections;
      }

      /** Stop the worker and release this detector. */
      remove() {
        this.worker?.terminate();
        this.worker = null;
        this.ready = false;
        this.busy = false;
        this.detectors?.delete(this);
      }
    }

    p5.AprilTagDetector = AprilTagDetector;

    fn.createAprilTagDetector = function (video, options) {
      return new AprilTagDetector(this, video, options);
    };

    lifecycles.remove = function () {
      const detectors = detectorsBySketch.get(this);
      if (!detectors) return;
      for (const detector of [...detectors]) detector.remove();
      detectorsBySketch.delete(this);
    };
  }

  function aprilTagWorker(loaderUrl, wasmUrl, configuration) {
    const familyInfo = [
      { name: "tag36h11", minHamming: 0 },
      { name: "tag25h9", minHamming: 0 },
      { name: "tag16h5", minHamming: 0 },
      { name: "tagCircle21h7", minHamming: 0, maxHamming: 0 },
      { name: "tagCircle49h12", minHamming: 1, maxHamming: 1 },
      { name: "tagCustom48h12", minHamming: 1 },
      { name: "tagStandard41h12", minHamming: 0 },
      { name: "tagStandard52h13", minHamming: 1 },
    ];
    const detectionSize = 60;
    importScripts(loaderUrl);
    let module;
    let imagePointer = 0;
    let imageSize = 0;
    let detectionPointer = 0;
    let detectTags;

    function effectiveHamming(family) {
      const info = familyInfo.find((candidate) => candidate.name === family);
      return Math.min(
        info.maxHamming ?? 3,
        Math.max(info.minHamming, configuration.hammingDistance),
      );
    }

    AprilTagWasm({ locateFile: (path) => path.endsWith(".wasm") ? wasmUrl : path }).then((wasm) => {
      module = wasm;
      const initializeDetector = module.cwrap("initialize_detector", "number", ["string", "number"]);
      const addFamily = module.cwrap("add_family", "number", ["number", "number"]);
      const setParameters = module.cwrap("set_detector_parameters", "void", [
        "number", "number", "number", "number", "number",
      ]);
      detectTags = module.cwrap("detect_tags", "number", [
        "number", "number", "number", "number", "number",
      ]);

      const firstFamily = configuration.families[0];
      let result = initializeDetector(firstFamily, effectiveHamming(firstFamily));
      for (const family of configuration.families.slice(1)) {
        if (result !== 0) break;
        const index = familyInfo.findIndex((candidate) => candidate.name === family);
        result = addFamily(index, effectiveHamming(family));
      }
      if (result !== 0) throw new Error(`AprilTag detector setup failed with code ${result}.`);

      const parameters = configuration.parameters;
      setParameters(
        parameters.quadDecimate,
        parameters.quadSigma,
        parameters.refineEdges ? 1 : 0,
        parameters.decodeSharpening,
        parameters.debug ? 1 : 0,
      );
      detectionPointer = module._malloc(detectionSize * configuration.maxDetections);
      if (!detectionPointer) throw new Error("Could not allocate the AprilTag detection buffer.");
      postMessage({ type: "ready" });
    }).catch((error) => postMessage({ type: "error", value: String(error) }));

    onmessage = ({ data }) => {
      if (data.type !== "detect" || !module) return;
      try {
        const requiredSize = data.width * data.height;
        if (requiredSize > imageSize) {
          if (imagePointer) module._free(imagePointer);
          imagePointer = module._malloc(requiredSize);
          if (!imagePointer) throw new Error("Could not allocate the AprilTag image buffer.");
          imageSize = requiredSize;
        }
        module.HEAPU8.set(data.gray, imagePointer);
        const started = performance.now();
        const count = detectTags(
          imagePointer,
          data.width,
          data.height,
          detectionPointer,
          configuration.maxDetections,
        );
        if (count < 0) throw new Error(`AprilTag detection failed with code ${count}.`);

        const value = [];
        for (let index = 0; index < count; index += 1) {
          const offset = detectionPointer + index * detectionSize;
          const familyId = module.getValue(offset + 4, "i32");
          const corners = [];
          for (let corner = 0; corner < 4; corner += 1) {
            const cornerOffset = offset + 16 + corner * 8;
            corners.push({
              x: module.getValue(cornerOffset, "float"),
              y: module.getValue(cornerOffset + 4, "float"),
            });
          }
          value.push({
            id: module.getValue(offset, "i32"),
            family: familyInfo[familyId]?.name ?? "unknown",
            familyId,
            center: {
              x: module.getValue(offset + 8, "float"),
              y: module.getValue(offset + 12, "float"),
            },
            corners,
            decisionMargin: module.getValue(offset + 48, "float"),
            hamming: module.getValue(offset + 52, "float"),
            rotation: module.getValue(offset + 56, "float"),
          });
        }
        postMessage({
          type: "detections",
          value,
          processingTime: performance.now() - started,
        });
      } catch (error) {
        postMessage({ type: "error", value: String(error) });
      }
    };
  }

  if (typeof p5 === "undefined" || typeof p5.registerAddon !== "function") {
    throw new Error("p5.apriltag.js requires p5.js 2.x and must load after p5.js.");
  }
  p5.registerAddon(aprilTagAddon);
})();
