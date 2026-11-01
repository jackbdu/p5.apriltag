# p5.apriltag contributor guide

## Scope

These instructions apply to this addon and all files below this directory.

## Design requirements

- Target p5.js 2.x and use the official `p5.registerAddon()` API.
- Preserve support for both p5 global mode and instance mode.
- Keep normal p5 responsibilities in the sketch: camera creation, canvas setup,
  video display, and visualization of detections.
- The addon accepts a p5 video `MediaElement` and returns AprilTag detections; it
  must not create a camera, canvas, or user interface.
- Keep errors and diagnostic messages in callbacks, object properties, or the
  browser console. Do not add status elements or custom page UI.
- Do not copy or embed third-party JavaScript or WASM. Load upstream runtime
  files from immutable, commit-pinned HTTPS URLs with CORS support.
- Keep the distributable addon at `lib/p5.apriltag.js` and runnable examples
  under `examples/`.
- Examples should use ordinary p5 structure and minimally styled or unstyled
  HTML unless a specific example requires presentation styling.

## Public API

- Register sketch-facing functions on `fn` using `function` syntax so p5 binds
  the correct sketch instance as `this`.
- Maintain `createAprilTagDetector(video, options?)` as the primary factory.
- Maintain automatic worker cleanup through the p5 `remove` lifecycle hook.
- Changes to public names, detection objects, defaults, or async behavior must
  be reflected in `README.md` and all examples.

## Verification

- Run `node --check lib/p5.apriltag.js` and syntax-check every example sketch.
- Verify the addon registers through `p5.registerAddon()`, exposes the factory
  on `fn`, exposes `p5.AprilTagDetector`, and installs the `remove` lifecycle.
- When dependency URLs change, verify both hosted files return successfully,
  permit cross-origin loading, and are pinned to an immutable revision.

## Attribution

Keep the Acknowledgements section in `README.md` accurate. Preserve attribution
for AprilTag, AprilTag JS, the sample marker images, and p5.js.
