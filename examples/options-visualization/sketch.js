const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const TAG_FAMILIES = [
  "tag36h11",
  "tag25h9",
  "tag16h5",
  "tagCircle21h7",
  "tagCircle49h12",
  "tagCustom48h12",
  "tagStandard41h12",
  "tagStandard52h13",
];

let video;
let detector;
let detectorOptions;
let detectorMessage = "Loading detector…";
let appliedFormState;

function setup() {
  const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
  canvas.parent("canvas-container");
  video = createCapture(VIDEO);
  video.size(VIDEO_WIDTH, VIDEO_HEIGHT);
  video.hide();

  createFamilyControls();
  createOptionStatuses();
  const detectorForm = document.querySelector("#detector-options");
  detectorForm.addEventListener("submit", applyOptions);
  detectorForm.addEventListener("input", markOptionsChanged);
  detectorForm.addEventListener("reset", () => {
    setTimeout(() => {
      syncAllFamiliesToggle();
      syncRangeOutputs();
      rebuildDetector();
    });
  });
  document.querySelector("#all-families").addEventListener("change", (event) => {
    for (const checkbox of document.querySelectorAll("input[name='families']")) {
      checkbox.checked = event.target.checked;
    }
  });
  for (const slider of document.querySelectorAll("input[type='range']")) {
    slider.addEventListener("input", syncRangeOutputs);
  }
  for (const button of document.querySelectorAll("button.help")) {
    button.setAttribute("aria-label", "Toggle explanation");
    button.addEventListener("click", () => {
      const explanation = document.querySelector(`#${button.getAttribute("aria-controls")}`);
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      explanation.hidden = expanded;
    });
  }
  syncRangeOutputs();
  rebuildDetector();
}

function draw() {
  image(video, 0, 0, width, height);
  if (!detector) return;

  const detections = detector.detect();
  const scaleX = width / detector.width;
  const scaleY = height / detector.height;
  const visible = visualizationOptions();

  for (const tag of detections) {
    drawDetection(tag, scaleX, scaleY, visible);
  }
  updateOutputs(detections);
}

function createFamilyControls() {
  const fieldset = document.querySelector("#families");
  for (const family of TAG_FAMILIES) {
    const label = document.createElement("label");
    label.innerHTML = `<input name="families" type="checkbox" value="${family}" checked /> ${family}`;
    label.querySelector("input").addEventListener("change", syncAllFamiliesToggle);
    fieldset.append(label);
  }
}

function applyOptions(event) {
  event.preventDefault();
  rebuildDetector();
}

function rebuildDetector() {
  const form = document.querySelector("#detector-options");
  const data = new FormData(form);
  const families = data.getAll("families");
  if (families.length === 0) {
    detectorMessage = "Select at least one tag family.";
    setOptionsStatus("Changes not applied: select at least one tag family.");
    return;
  }

  const [width, height] = data.get("resolution").split("x").map(Number);
  const options = {
    width,
    height,
    families,
    hammingDistance: Number(data.get("hammingDistance")),
    maxDetections: Number(data.get("maxDetections")),
    quadDecimate: Number(data.get("quadDecimate")),
    quadSigma: Number(data.get("quadSigma")),
    refineEdges: data.has("refineEdges"),
    decodeSharpening: Number(data.get("decodeSharpening")),
  };
  if (data.has("limitRate")) {
    options.detectionsPerSecond = Number(data.get("detectionsPerSecond"));
  }
  if (data.get("loaderUrl")) options.loaderUrl = data.get("loaderUrl");
  if (data.get("wasmUrl")) options.wasmUrl = data.get("wasmUrl");

  try {
    const nextDetector = createAprilTagDetector(video, {
      ...options,
      onReady: () => {
        detectorMessage = "Ready";
        const changed = updateOptionStatuses();
        setOptionsStatus(
          changed ? "Changes not applied." : "Options applied.",
          changed ? "warning" : "success",
        );
      },
      onError: (error) => {
        detectorMessage = error.message;
        setOptionsStatus(`Detector error: ${error.message}`, "error");
      },
    });
    detector?.remove();
    detector = nextDetector;
    detectorOptions = options;
    detectorMessage = "Loading detector…";
    appliedFormState = readDetectorFormState();
    showAppliedOptions();
    updateOptionStatuses();
    setOptionsStatus("Options applied; detector loading…", "success");
  } catch (error) {
    updateOptionStatuses();
    setOptionsStatus(`Changes not applied: ${error.message}`, "error");
  }
}

function visualizationOptions() {
  const data = new FormData(document.querySelector("#visualization-options"));
  return Object.fromEntries(
    ["outline", "corners", "center", "rotation", "label", "details"].map(
      (name) => [name, data.has(name)],
    ),
  );
}

function drawDetection(tag, scaleX, scaleY, visible) {
  const point = ({ x, y }) => ({ x: x * scaleX, y: y * scaleY });
  const center = point(tag.center);
  const corners = tag.corners.map(point);

  if (visible.outline) {
    noFill();
    stroke(0, 255, 170);
    strokeWeight(3);
    beginShape();
    for (const corner of corners) vertex(corner.x, corner.y);
    endShape(CLOSE);
  }

  if (visible.corners) {
    textAlign(CENTER, CENTER);
    textSize(12);
    for (const [index, corner] of corners.entries()) {
      noStroke();
      fill(255, 190, 0);
      circle(corner.x, corner.y, 18);
      fill(0);
      text(index, corner.x, corner.y);
    }
  }

  if (visible.center) {
    stroke(255, 60, 100);
    strokeWeight(2);
    line(center.x - 8, center.y, center.x + 8, center.y);
    line(center.x, center.y - 8, center.x, center.y + 8);
  }

  if (visible.rotation) {
    const axisLength = 45;
    stroke(80, 180, 255);
    strokeWeight(4);
    line(
      center.x,
      center.y,
      center.x + Math.cos(tag.rotation) * axisLength,
      center.y + Math.sin(tag.rotation) * axisLength,
    );
  }

  if (visible.label || visible.details) {
    const lines = [];
    if (visible.label) lines.push(`${tag.family} #${tag.id}`);
    if (visible.details) {
      lines.push(`familyId ${tag.familyId}  hamming ${tag.hamming}`);
      lines.push(`margin ${tag.decisionMargin.toFixed(2)}`);
      lines.push(`rotation ${tag.rotation.toFixed(3)} rad`);
      lines.push(`center ${tag.center.x.toFixed(1)}, ${tag.center.y.toFixed(1)}`);
    }
    noStroke();
    fill(0, 180);
    rect(center.x + 10, center.y + 10, 220, lines.length * 18 + 8);
    fill(255);
    textAlign(LEFT, TOP);
    textSize(13);
    text(lines.join("\n"), center.x + 14, center.y + 14);
  }
}

function updateOutputs(detections) {
  const state = {
    message: detectorMessage,
    ready: detector.ready,
    busy: detector.busy,
    error: detector.error?.message ?? null,
    processingTime: detector.processingTime,
    width: detector.width,
    height: detector.height,
    interval: detector.interval,
    families: detector.families,
    hammingDistance: detector.hammingDistance,
    detectionCount: detections.length,
  };
  document.querySelector("#detector-state").textContent = JSON.stringify(state, null, 2);
  document.querySelector("#detection-output").textContent = JSON.stringify(detections, null, 2);
}

function syncAllFamiliesToggle() {
  const familyBoxes = [...document.querySelectorAll("input[name='families']")];
  const all = document.querySelector("#all-families");
  all.checked = familyBoxes.every((checkbox) => checkbox.checked);
  all.indeterminate = !all.checked && familyBoxes.some((checkbox) => checkbox.checked);
}

function syncRangeOutputs() {
  for (const output of document.querySelectorAll("output[for]")) {
    const slider = document.querySelector(`#${output.getAttribute("for")}`);
    output.value = slider.value;
  }
}

function markOptionsChanged() {
  const changed = updateOptionStatuses();
  setOptionsStatus(
    changed ? "Changes not applied." : "Options applied.",
    changed ? "warning" : "success",
  );
}

function setOptionsStatus(message, type = "warning") {
  const status = document.querySelector("#options-status");
  status.hidden = false;
  status.className = `status-${type}`;
  status.querySelector("strong").textContent = message;
}

function showAppliedOptions() {
  document.querySelector("#applied-options").textContent = detectorOptions
    ? JSON.stringify(detectorOptions, null, 2)
    : "None";
}

function createOptionStatuses() {
  for (const option of document.querySelectorAll("#detector-options .option")) {
    const status = document.createElement("span");
    status.className = "option-status";
    const label = option.querySelector("label");
    label.append(" ", status);
  }
}

function readDetectorFormState() {
  const state = {};
  const controls = document.querySelectorAll(
    "#detector-options input, #detector-options select",
  );
  for (const control of controls) {
    const key = control.name === "families"
      ? `families:${control.value}`
      : control.id || control.name;
    state[key] = control.type === "checkbox" ? control.checked : control.value;
  }
  return state;
}

function updateOptionStatuses() {
  const current = readDetectorFormState();
  let anyChanged = !appliedFormState;
  for (const option of document.querySelectorAll("#detector-options .option")) {
    const controls = option.closest("#families")
      ? document.querySelectorAll("#families input")
      : option.querySelectorAll("input, select");
    const changed = !appliedFormState || [...controls].some((control) => {
      const key = control.name === "families"
        ? `families:${control.value}`
        : control.id || control.name;
      return current[key] !== appliedFormState[key];
    });
    anyChanged ||= changed;
    option.querySelector(".option-status").textContent = changed
      ? "Changes not applied"
      : "";
  }
  return anyChanged;
}
