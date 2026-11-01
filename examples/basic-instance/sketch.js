new p5((p) => {
  let video;
  let aprilTag;

  p.setup = () => {
    p.createCanvas(640, 480);
    video = p.createCapture(p.VIDEO);
    video.size(640, 480);
    video.hide();
    aprilTag = p.createAprilTagDetector(video);
  };

  p.draw = () => {
    p.image(video, 0, 0);

    for (const tag of aprilTag.detect()) {
      p.noFill();
      p.stroke(0, 255, 170);
      p.beginShape();
      for (const corner of tag.corners) p.vertex(corner.x, corner.y);
      p.endShape(p.CLOSE);

      p.noStroke();
      p.fill(255);
      p.text(`${tag.family} ${tag.id}`, tag.center.x, tag.center.y);
    }
  };
});
