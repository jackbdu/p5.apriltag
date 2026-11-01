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
- When adding or renaming an example, update any corresponding live-demo link
  in `README.md` and include every example sketch in the syntax-check command.

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

## Versioning and releases

- Use semantic versioning: patch for compatible fixes, minor for compatible
  features, and major for breaking API changes. Do not bump the version for
  ordinary unreleased work; perform the bump as part of preparing a release.
- Before choosing a version, inspect existing Git tags and confirm the proposed
  `v<version>` tag is unused. Never move or reuse a published tag; issue a new
  patch version instead.
- For every release, update `package.json` to the exact release version. Keep
  the README installation URL on the major-version alias, such as `@v0`, rather
  than a minor or patch version that needs frequent documentation updates, or
  the unrestricted `@main` branch. Update the README alias only for a major
  release. Keep public API documentation and examples synchronized with the
  released behavior.
- Run the full `npm run check`, `git diff --check`, and the dependency URL checks
  above when applicable. Review the release diff and ensure unrelated work is
  not included.
- Commit all release changes before tagging. Create an annotated tag named
  `v<package version>` on that release commit with a message such as
  `Release v0.1.0`; verify the tag points to the release commit and that its
  `package.json` version matches. Verify the README URL uses the corresponding
  major-version alias.
- A commit or release-preparation request does not by itself authorize pushing
  or publishing. When the user requests a release push, push both the release
  commit and its exact tag, using explicit commands or `--follow-tags`.
- After pushing, verify the remote tag exists and the exact jsDelivr `/gh/` URL
  for the tagged addon returns successfully with cross-origin loading allowed.
  Treat the release as incomplete until these checks pass or a propagation
  delay is reported to the user.
- npm publication is not part of the release process while `package.json`
  contains `"private": true`; GitHub tags provide the versions consumed by the
  jsDelivr `/gh/` URL.

## Attribution

Keep the Acknowledgements section in `README.md` accurate. Preserve attribution
for AprilTag, AprilTag JS, the sample marker images, and p5.js.
