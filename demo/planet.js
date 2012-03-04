var Planet = function() {
  Demo.call(this);

  var space = this.space;
  space.iterations = 20;
  space.sleepTimeThreshold = 0.5;
  space.collisionSlop = 0.5;

  var gravityStrength = 5.0e6;

  // Create a rouge body to control the planet manually.
  var planetBody = new cp.Body(Infinity, Infinity);
  planetBody.w = 0.2;
  
  // Gravitational acceleration is proportional to the inverse square of
  // distance, and directed toward the origin. The central planet is assumed
  // to be massive enough that it affects the satellites but not vice versa.
  /*
  * cpBody *body
  * cpVect gravity
  * cpFloat damping
  * cpFloat dt
  */
  var planetGravityVelocityFunc = function(gravity, damping, dt) {
    var p = this.p;
    var sqdist = cp.v.lensq(p);
    var g = cp.v.mult(p, -gravityStrength / (sqdist * Math.sqrt(sqdist)));
    this.updateVelocity(g, damping, dt);
  }
  
  var rand_pos = function(radius) {
    var vv;
    do {
      vv = cp.v(Math.random() * (640 - 2 * radius) - (320 - radius), Math.random() * (480 - 2 * radius) - (240 - radius));
    } while(cp.v.len(vv) < 85.0);
	
    return vv;
  }

  var add_box = function() {
    var size = 10.0;
    var mass = 1.0;
	
    var verts = [
      cp.v(-size, -size),
      cp.v(-size,  size),
      cp.v( size,  size),
      cp.v( size, -size)
    ];
	
    var radius = cp.v.len(cp.v(size, size));
    var pos = rand_pos(radius);
	
    // var body = space.addBody(new cp.Body(mass, cp.momentForPoly(mass, 4, verts, cp.vzero)));
    var body = space.addBody(new cp.Body(mass, 1));
    body.velocity_func = planetGravityVelocityFunc;
    body.setPos(pos);

    // Set the box's velocity to put it into a circular orbit from its
    // starting position.
    var r = cp.v.len(pos);
    var v = Math.sqrt(gravityStrength / r) / r;
    body.setVelocity(cp.v.mult(cp.v.perp(pos), v));

    // Set the box's angular velocity to match its orbital period and
    // align its initial angle with its position.
    body.w = v;
    body.setAngle(Math.atan2(pos.y, pos.x));

    var shape = space.addShape(new cp.PolyShape(body, 4, verts, cp.vzero));
    shape.setElasticity(0.0);
    shape.setFriction(0.7);
  }
  
  for (var i = 0; i < 30; i++) {
    add_box();
  }

  var shape = space.addShape(new cp.CircleShape(planetBody, 70.0, cp.vzero));
  shape.setElasticity(1.0);
  shape.setFriction(1.0);
  shape.setLayers(NOT_GRABABLE_MASK);


  var update = function(ticks) {
    var steps = 1;
    var dt = 1.0 / 60.0 / steps;
	
    for (var i = 0; i < steps; i++) {
      space.step(dt);
      // Update the static body spin so that it looks like it's rotating.
      planetBody.updatePosition(dt);
    }
  }
}

Planet.prototype = Object.create(Demo.prototype);
addDemo('Planet', Planet);
