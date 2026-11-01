let video;
let aprilTag;

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  aprilTag = createAprilTagDetector(video, {
    families: [
      "tag36h11",
      "tag25h9",
      "tag16h5",
      "tagCircle21h7",
      "tagCircle49h12",
      "tagCustom48h12",
      "tagStandard41h12",
      "tagStandard52h13",
    ],
  });
}

function draw() {
  image(video, 0, 0);

  for (const tag of aprilTag.detect()) {
    noFill();
    stroke(0, 255, 170);
    beginShape();
    for (const corner of tag.corners) vertex(corner.x, corner.y);
    endShape(CLOSE);

    noStroke();
    fill(255);
    text(`${tag.family} ${tag.id}`, tag.center.x, tag.center.y);
  }
}
