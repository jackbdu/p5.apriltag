# p5.apriltag

AprilTag detection for p5.js 2.x, with global and instance mode support.

## Live demos

- [Camera detection example](https://jackbdu.github.io/p5.apriltag/examples/basic-global/)
- [Sample markers](https://jackbdu.github.io/p5.apriltag/examples/tags/)

Additional markers are available from the official
[AprilTag image collection](https://github.com/AprilRobotics/apriltag-imgs).
Custom families and layouts can be created with
[AprilTag generation](https://github.com/AprilRobotics/apriltag-generation).

## Quick start

To try the addon, open the
[camera detection example in the p5.js Web Editor](https://editor.p5js.org/jackbdu/sketches/migJmdT3t).

To use the addon, duplicate the sample sketch in the p5.js Web Editor, or
follow the steps below to add it to your own sketch. First, load p5.js and then
add p5.apriltag to your HTML file:

```html
<script src="https://cdn.jsdelivr.net/gh/jackbdu/p5.apriltag@v0/lib/p5.apriltag.js"></script>
```

The addon and its WebAssembly runtime require an internet connection.

```js
let video;
let detector;

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  detector = createAprilTagDetector(video);
}

function draw() {
  image(video, 0, 0);

  for (const tag of detector.detect()) {
    noFill();
    stroke(0, 255, 170);
    beginShape();
    for (const corner of tag.corners) vertex(corner.x, corner.y);
    endShape(CLOSE);
  }
}
```

`detect()` schedules a frame and returns the most recently completed detection
array. Use `onReady` if the sketch needs to know when the detector has loaded.

## API

### `createAprilTagDetector(video, options?)`

Creates a `p5.AprilTagDetector` for a video returned by `createCapture()`.

| Option | Default | Description |
| --- | --- | --- |
| `width`, `height` | video size | Detection resolution |
| `detectionsPerSecond` | uncapped | Optional maximum detection rate |
| `family` | — | One family to detect instead of all supported families |
| `families` | all supported | Family array to detect; overrides `family` |
| `hammingDistance` | `0` | Correctable bits, from `0` to `3` |
| `maxDetections` | `100` | Maximum results per frame |
| `quadDecimate` | `2` | Image decimation used by the detector |
| `quadSigma` | `0` | Gaussian blur applied before detection |
| `refineEdges` | `true` | Refine detected tag edges |
| `decodeSharpening` | `0.25` | Decode sharpening amount |
| `debug` | `false` | Enable detector debugging |
| `onReady(detector)` | — | Called when the detector is ready |
| `onError(error)` | — | Called when loading or detection fails |
| `loaderUrl`, `wasmUrl` | pinned defaults | URLs for a compatible runtime build |

The detector checks all supported tag families by default. Set `family` or
`families` to limit detection to a known subset and improve performance.

By default, detection is scheduled whenever `detect()` is called and the
worker is idle. If detection is still in progress, the request is skipped and
the latest completed results are returned. Set `detectionsPerSecond` only when
you want an additional fixed rate limit.

Supported families:

- `tag36h11`
- `tag25h9`
- `tag16h5`
- `tagCircle21h7`
- `tagCircle49h12`
- `tagCustom48h12`
- `tagStandard41h12`
- `tagStandard52h13`

Select one family:

```js
detector = createAprilTagDetector(video, {
  family: "tagStandard41h12",
});
```

Select several families:

```js
detector = createAprilTagDetector(video, {
  families: ["tag36h11", "tagStandard41h12"],
  hammingDistance: 1,
});
```

Each detection contains:

- `id`
- `family` and `familyId`
- `center`
- `corners`
- `decisionMargin`
- `hamming`
- `rotation`

Detector properties include `detections`, `families`, `hammingDistance`,
`processingTime`, `ready`, `busy`, and `error`.

Call `remove()` to stop a detector manually. Detectors are also stopped when
the p5 sketch is removed.

## Instance mode

```js
new p5((p) => {
  let video;
  let detector;

  p.setup = () => {
    p.createCanvas(640, 480);
    video = p.createCapture(p.VIDEO);
    video.size(640, 480);
    video.hide();
    detector = p.createAprilTagDetector(video);
  };

  p.draw = () => {
    p.image(video, 0, 0);
    for (const tag of detector.detect()) {
      p.circle(tag.center.x, tag.center.y, 20);
    }
  };
});
```

## Tests

```sh
npm test
npm run check
```

## Acknowledgements

- [AprilTag](https://github.com/AprilRobotics/apriltag), BSD 2-Clause
- [AprilTag JS](https://github.com/AliAlimohamad/apriltag-js), BSD 2-Clause
- [AprilTag marker images](https://github.com/AprilRobotics/apriltag-imgs),
  BSD 2-Clause
- [p5.js](https://github.com/processing/p5.js), LGPL-2.1

## License

The addon code is available under the [MIT License](LICENSE). The included
marker images retain their BSD 2-Clause license; see [LICENSE](LICENSE).
