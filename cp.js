(function(){
/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

Object.create = Object.create || function(o) {
	function F() {}
	F.prototype = o;
	return new F();
};
 
//var VERSION = CP_VERSION_MAJOR + "." + CP_VERSION_MINOR + "." + CP_VERSION_RELEASE;

if(typeof exports === 'undefined'){
	window.cp = exports = {};
}

var assert = function(value, message)
{
	if (!value) {
		throw new Error('Assertion failed: ' + message);
	}
};

var assertSoft = function(value, message)
{
	if(!value && console && console.warn) {
		console.warn("ASSERTION FAILED: " + message);
	}
};

var hashPair = function(a, b)
{
	return a + ' ' + b;
};

var numContacts = 0;
var Contact = function(p, n, dist, hash)
{
	this.p = p;
	this.n = n;
	this.dist = dist;
	
	this.r1 = this.r2 = vzero;
	this.nMass = this.tMass = this.bounce = this.bias = 0;

	this.jnAcc = this.jtAcc = this.jBias = 0;
	
	this.hash = hash;
	numContacts++;
};

var mymin = function(a, b)
{
	return a < b ? a : b;
};
var mymax = function(a, b)
{
	return a > b ? a : b;
};

var min, max;
if (typeof window === 'object' && window.navigator.userAgent.indexOf('Firefox') > -1){
	// On firefox, Math.min and Math.max are really fast:
	// http://jsperf.com/math-vs-greater-than/8
 	min = Math.min;
	max = Math.max;
} else {
	// On chrome and safari, Math.min / max are slooow. The ternery operator above is faster
	// than the builtins because we only have to deal with 2 arguments that are always numbers.
	min = mymin;
	max = mymax;
}

var deleteObjFromList = function(arr, obj)
{
	for(var i=0; i<arr.length; i++){
		if(arr[i] === obj){
			arr[i] = arr[arr.length - 1];
			arr.length--;
			
			return;
		}
	}
};

var momentForCircle = exports.momentForCircle = function(m, r1, r2, offset)
{
	return m*(0.5*(r1*r1 + r2*r2) + vlengthsq(offset));
};

var areaForCircle = exports.areaForCircle = function(r1, r2)
{
	return Math.PI*Math.abs(r1*r1 - r2*r2);
};

var momentForSegment = exports.momentForSegment = function(m, a, b)
{
	var length = vlength(vsub(b, a));
	var offset = vmult(vadd(a, b), 1/2);
	
	return m*(length*length/12 + vlengthsq(offset));
};

var areaForSegment = exports.areaForSegment = function(a, b, r)
{
	return r*(Math.PI*r + 2*vdist(a, b));
};

var momentForPoly = exports.momentForPoly = function(m, verts, offset)
{
	var sum1 = 0;
	var sum2 = 0;
	for(var i=0, len=verts.length; i<len; i++){
		var v1 = vadd(verts[i], offset);
		var v2 = vadd(verts[(i+1)%len], offset);
		
		var a = vcross(v2, v1);
		var b = vdot(v1, v1) + vdot(v1, v2) + vdot(v2, v2);
		
		sum1 += a*b;
		sum2 += a;
	}
	
	return (m*sum1)/(6*sum2);
};

var areaForPoly = exports.areaForPoly = function(verts)
{
	var area = 0;
	for(var i=0, len=verts.length; i<len; i++){
		area += vcross(verts[i], verts[(i+1)%len]);
	}
	
	return -area/2;
};

var centroidForPoly = exports.centroidForPoly = function(verts)
{
	var sum = 0;
	var vsum = [0,0];
	
	for(var i=0, len=verts.length; i<len; i++){
		var v1 = verts[i];
		var v2 = verts[(i+1)%len];
		var cross = vcross(v1, v2);
		
		sum += cross;
		vsum = vadd(vsum, vmult(vadd(v1, v2), cross));
	}
	
	return vmult(vsum, 1/(3*sum));
};

var recenterPoly = exports.recenterPoly = function(verts)
{
	var centroid = centroidForPoly(verts);
	
	for(var i=0; i<verts.length; i++){
		verts[i] = vsub(verts[i], centroid);
	}
};

var momentForBox = exports.momentForBox = function(m, width, height)
{
	return m*(width*width + height*height)/12;
};

var momentForBox2 = exports.momentForBox2 = function(m, box)
{
	width = box.r - box.l;
	height = box.t - box.b;
	offset = vmult([box.l + box.r, box.b + box.t], 0.5);
	
	return momentForBox(m, width, height) + m*vlengthsq(offset);
};

/// Clamp @c f to be between @c min and @c max.
var clamp = function(f, minv, maxv)
{
	return min(max(f, minv), maxv);
};

/// Clamp @c f to be between 0 and 1.
var clamp01 = function(f)
{
	return max(0, min(f, 1));
};

/// Linearly interpolate (or extrapolate) between @c f1 and @c f2 by @c t percent.
var lerp = function(f1, f2, t)
{
	return f1*(1 - t) + f2*t;
};

/// Linearly interpolate from @c f1 to @c f2 by no more than @c d.
var lerpconst = function(f1, f2, d)
{
	return f1 + clamp(f2 - f1, -d, d);
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// I'm using an array tuple here because (at time of writing) its about 3x faster
// than an object on firefox, and the same speed on chrome.

var numVects = 0;

var traces = {};

var Vect = exports.Vect = function(x, y)
{
	this.x = x;
	this.y = y;
//	numVects++;

//	var s = new Error().stack;
//	traces[s] = traces[s] ? traces[s]+1 : 1;
};

exports.v = {};

var vzero = new Vect(0,0);

// The functions below *could* be rewritten to be instance methods on Vect. I don't
// know how that would effect performance. For now, I'm keeping the JS similar to
// the original C code.

/// Vector dot product.
var vdot = exports.v.dot = function(v1, v2)
{
	return v1.x*v2.x + v1.y*v2.y;
};

var vdot2 = function(x1, y1, x2, y2)
{
	return x1*x2 + y1*y2;
};

/// Returns the length of v.
var vlength = exports.v.length = function(v)
{
	return Math.sqrt(vdot(v, v));
};

/// Check if two vectors are equal. (Be careful when comparing floating point numbers!)
var veql = exports.v.eql = function(v1, v2)
{
	return (v1.x === v2.x && v1.y === v2.y);
};

/// Add two vectors
var vadd = exports.v.add = function(v1, v2)
{
	return new Vect(v1.x + v2.x, v1.y + v2.y);
};

Vect.prototype.add = function(v2)
{
	this.x += v2.x;
	this.y += v2.y;
	return this;
};

/// Subtract two vectors.
var vsub = exports.v.sub = function(v1, v2)
{
	return new Vect(v1.x - v2.x, v1.y - v2.y);
};

Vect.prototype.sub = function(v2)
{
	this.x -= v2.x;
	this.y -= v2.y;
	return this;
};

/// Negate a vector.
var vneg = exports.v.neg = function(v)
{
	return new Vect(-v.x, -v.y);
};

Vect.prototype.neg = function()
{
	this.x = -this.x;
	this.y = -this.y;
	return this;
};

/// Scalar multiplication.
var vmult = exports.v.mult = function(v, s)
{
	return new Vect(v.x*s, v.y*s);
};

Vect.prototype.mult = function(s)
{
	this.x *= s;
	this.y *= s;
	return this;
};

/// 2D vector cross product analog.
/// The cross product of 2D vectors results in a 3D vector with only a z component.
/// This function returns the magnitude of the z value.
var vcross = exports.v.cross = function(v1, v2)
{
	return v1.x*v2.y - v1.y*v2.x;
};

var vcross2 = function(x1, y1, x2, y2)
{
	return x1*y2 - y1*x2;
};

/// Returns a perpendicular vector. (90 degree rotation)
var vperp = exports.v.perp = function(v)
{
	return new Vect(-v.y, v.x);
};

/// Returns a perpendicular vector. (-90 degree rotation)
var vpvrperp = exports.v.pvrperp = function(v)
{
	return new Vect(v.y, -v.x);
};

/// Returns the vector projection of v1 onto v2.
var vproject = exports.v.project = function(v1, v2)
{
	return vmult(v2, vdot(v1, v2)/v2.lengthsq());
};

Vect.prototype.project = function(v2)
{
	this.mult(vdot(this, v2) / v2.lengthsq());
	return this;
};

/// Uses complex number multiplication to rotate v1 by v2. Scaling will occur if v1 is not a unit vector.
var vrotate = exports.v.rotate = function(v1, v2)
{
	return new Vect(v1.x*v2.x - v1.y*v2.y, v1.x*v2.y + v1.y*v2.x);
};

Vect.prototype.rotate = function(v2)
{
	this.x = this.x * v2.x - this.y * v2.y;
	this.y = this.x * v2.y + this.y * v2.x;
	return this;
};

/// Inverse of vrotate().
var vunrotate = exports.v.unrotate = function(v1, v2)
{
	return new Vect(v1.x*v2.x + v1.y*v2.y, v1.y*v2.x - v1.x*v2.y);
};

/// Returns the squared length of v. Faster than vlength() when you only need to compare lengths.
var vlengthsq = exports.v.lengthsq = function(v)
{
	return vdot(v, v);
};

/// Linearly interpolate between v1 and v2.
var vlerp = exports.v.lerp = function(v1, v2, t)
{
	return vadd(vmult(v1, 1 - t), vmult(v2, t));
};

/// Returns a normalized copy of v.
var vnormalize = exports.v.normalize = function(v)
{
	return vmult(v, 1/vlength(v));
};

/// Returns a normalized copy of v or vzero if v was already vzero. Protects against divide by zero errors.
var vnormalize_safe = exports.v.normalize_safe = function(v)
{
	return (v.x === 0 && v.y === 0 ? vzero : vnormalize(v));
};

/// Clamp v to length len.
var vclamp = exports.v.clamp = function(v, len)
{
	return (vdot(v,v) > len*len) ? vmult(vnormalize(v), len) : v;
};

/// Linearly interpolate between v1 towards v2 by distance d.
var vlerpconst = exports.v.lerpconst = function(v1, v2, d)
{
	return vadd(v1, vclamp(vsub(v2, v1), d));
};

/// Returns the distance between v1 and v2.
var vdist = exports.v.dist = function(v1, v2)
{
	return vlength(vsub(v1, v2));
};

/// Returns the squared distance between v1 and v2. Faster than vdist() when you only need to compare distances.
var vdistsq = exports.v.distsq = function(v1, v2)
{
	return vlengthsq(vsub(v1, v2));
};

/// Returns true if the distance between v1 and v2 is less than dist.
var vnear = exports.v.near = function(v1, v2, dist)
{
	return vdistsq(v1, v2) < dist*dist;
};

/// Spherical linearly interpolate between v1 and v2.
var vslerp = exports.v.slerp = function(v1, v2, t)
{
	var omega = Math.acos(vdot(v1, v2));
	
	if(omega) {
		var denom = 1/Math.sin(omega);
		return vadd(vmult(v1, Math.sin((1 - t)*omega)*denom), vmult(v2, Math.sin(t*omega)*denom));
	} else {
		return v1;
	}
};

/// Spherical linearly interpolate between v1 towards v2 by no more than angle a radians
var vslerpconst = exports.v.slerpconst = function(v1, v2, a)
{
	var angle = Math.acos(vdot(v1, v2));
	return vslerp(v1, v2, min(a, angle)/angle);
};

/// Returns the unit length vector for the given angle (in radians).
var vforangle = exports.v.forangle = function(a)
{
	return new Vect(Math.cos(a), Math.sin(a));
};

/// Returns the angular direction v is pointing in (in radians).
var vtoangle = exports.v.toangle = function(v)
{
	return Math.atan2(v.y, v.x);
};

///	Returns a string representation of v. Intended mostly for debugging purposes and not production use.
var vstr = exports.v.str = function(v)
{
	return "(" + v.x.toFixed(3) + ", " + v.y.toFixed(3) + ")";
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// Chipmunk's axis-aligned 2D bounding box type along with a few handy routines.

var numBB = 0;

// Bounding boxes are JS objects with {l, b, r, t} = left, bottom, right, top, respectively.
var BB = function(l, b, r, t)
{
	this.l = l;
	this.b = b;
	this.r = r;
	this.t = t;

//	numBB++;
}

var bbNewForCircle = function(p, r)
{
	return new BB(
			p.x - r,
			p.y - r,
			p.x + r,
			p.y + r
		);
};

/// Returns true if @c a and @c b intersect.
var bbIntersects = function(a, b)
{
	return (a.l <= b.r && b.l <= a.r && a.b <= b.t && b.b <= a.t);
};

/// Returns true if @c other lies completely within @c bb.
var bbContainsBB = function(bb, other)
{
	return (bb.l <= other.l && bb.r >= other.r && bb.b <= other.b && bb.t >= other.t);
};

/// Returns true if @c bb contains @c v.
var bbContainsVect = function(bb, v)
{
	return (bb.l <= v.x && bb.r >= v.x && bb.b <= v.y && bb.t >= v.y);
};

/// Returns a bounding box that holds both bounding boxes.
var bbMerge = function(a, b){
	return new BB(
			min(a.l, b.l),
			min(a.b, b.b),
			max(a.r, b.r),
			max(a.t, b.t)
		);
};

/// Returns a bounding box that holds both @c bb and @c v.
var bbExpand = function(bb, v){
	return new BB(
			min(bb.l, v.x),
			min(bb.b, v.y),
			max(bb.r, v.x),
			max(bb.t, v.y)
		);
};

/// Returns the area of the bounding box.
var bbArea = function(bb)
{
	return (bb.r - bb.l)*(bb.t - bb.b);
};

/// Merges @c a and @c b and returns the area of the merged bounding box.
var bbMergedArea = function(a, b)
{
	return (max(a.r, b.r) - min(a.l, b.l))*(max(a.t, b.t) - min(a.b, b.b));
};

/// Returns the fraction along the segment query the cpBB is hit. Returns Infinity if it doesn't hit.
var bbSegmentQuery = function(bb, a, b)
{
	var idx = 1/(b.x - a.x);
	var tx1 = (bb.l == a.x ? -Infinity : (bb.l - a.x)*idx);
	var tx2 = (bb.r == a.x ?	Infinity : (bb.r - a.x)*idx);
	var txmin = min(tx1, tx2);
	var txmax = max(tx1, tx2);
	
	var idy = 1/(b.y - a.y);
	var ty1 = (bb.b == a.y ? -Infinity : (bb.b - a.y)*idy);
	var ty2 = (bb.t == a.y ?	Infinity : (bb.t - a.y)*idy);
	var tymin = min(ty1, ty2);
	var tymax = max(ty1, ty2);
	
	if(tymin <= txmax && txmin <= tymax){
		var min = max(txmin, tymin);
		var max = min(txmax, tymax);
		
		if(0.0 <= max && min <= 1.0) return max(min, 0.0);
	}
	
	return Infinity;
};

/// Return true if the bounding box intersects the line segment with ends @c a and @c b.
var bbIntersectsSegment = function(bb, a, b)
{
	return (bbSegmentQuery(bb, a, b) != Infinity);
};

/// Clamp a vector to a bounding box.
var bbClampVect = function(bb, v)
{
	var x = min(max(bb.l, v.x), bb.r);
	var y = min(max(bb.b, v.y), bb.t);
	return new Vect(x, y);
};

// TODO edge case issue
/// Wrap a vector to a bounding box.
var bbWrapVect = function(bb, v)
{
	var ix = Math.abs(bb.r - bb.l);
	var modx = (v.x - bb.l) % ix;
	var x = (modx > 0) ? modx : modx + ix;
	
	var iy = Math.abs(bb.t - bb.b);
	var mody = (v.y - bb.b) % iy;
	var y = (mody > 0) ? mody : mody + iy;
	
	return new Vect(x + bb.l, y + bb.b);
};
/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
 
/// Segment query info struct.
/* These are created using literals where needed.
typedef struct cpSegmentQueryInfo {
	/// The shape that was hit, null if no collision occured.
	cpShape *shape;
	/// The normalized distance along the query segment in the range [0, 1].
	cpFloat t;
	/// The normal of the surface hit.
	cpVect n;
} cpSegmentQueryInfo;
*/

var shapeIDCounter = 0;

var CP_NO_GROUP = 0;
var CP_ALL_LAYERS = ~0;

exports.resetShapeIdCounter = function()
{
	shapeIDCounter = 0;
};

/// The cpShape struct defines the shape of a rigid body.
//
/// Opaque collision shape struct. Do not create directly - instead use
/// PolyShape, CircleShape and SegmentShape.
var Shape = exports.Shape = function(body) {
	/// The rigid body this collision shape is attached to.
	this.body = body;

	/// The current bounding box of the shape.
	this.bb = null;

	this.hashid = shapeIDCounter++;

	/// Sensor flag.
	/// Sensor shapes call collision callbacks but don't produce collisions.
	this.sensor = false;
	
	/// Coefficient of restitution. (elasticity)
	this.e = 0;
	/// Coefficient of friction.
	this.u = 0;
	/// Surface velocity used when solving for friction.
	this.surface_v = vzero;
	
	/// Collision type of this shape used when picking collision handlers.
	this.collision_type = 0;
	/// Group of this shape. Shapes in the same group don't collide.
	this.group = 0;
	// Layer bitmask for this shape. Shapes only collide if the bitwise and of their layers is non-zero.
	this.layers = CP_ALL_LAYERS;
	
	this.space = null;

	// Copy the collision code from the prototype into the actual object. This makes collision
	// function lookups slightly faster.
	this.collisionCode = this.collisionCode;
};

Shape.prototype.setElasticity = function(e) { this.e = e; };
Shape.prototype.setFriction = function(u) { this.body.activate(); this.u = u; };
Shape.prototype.setLayers = function(layers) { this.body.activate(); this.layers = layers; };

Shape.prototype.active = function()
{
	return this.prev || (this.body.shapeList.length > 0 && this.body.shapeList[0] === this);
};

Shape.prototype.setBody = function(body)
{
	assert(!this.active(), "You cannot change the body on an active shape. You must remove the shape, then ");
	this.body = body;
};

Shape.prototype.cacheBB = function()
{
	return this.update(this.body.p, this.body.rot);
};

Shape.prototype.update = function(pos, rot)
{
	assert(!isNaN(rot.x), 'Rotation is NaN');
	assert(!isNaN(pos.x), 'Position is NaN');
	return (this.bb = this.cacheData(pos, rot));
};

/* Not implemented - all these getters and setters. Just edit the object directly.
CP_DefineShapeStructGetter(cpBody*, body, Body);
void cpShapeSetBody(cpShape *shape, cpBody *body);

CP_DefineShapeStructGetter(cpBB, bb, BB);
CP_DefineShapeStructProperty(cpBool, sensor, Sensor, cpTrue);
CP_DefineShapeStructProperty(cpFloat, e, Elasticity, cpFalse);
CP_DefineShapeStructProperty(cpFloat, u, Friction, cpTrue);
CP_DefineShapeStructProperty(cpVect, surface_v, SurfaceVelocity, cpTrue);
CP_DefineShapeStructProperty(cpDataPointer, data, UserData, cpFalse);
CP_DefineShapeStructProperty(cpCollisionType, collision_type, CollisionType, cpTrue);
CP_DefineShapeStructProperty(cpGroup, group, Group, cpTrue);
CP_DefineShapeStructProperty(cpLayers, layers, Layers, cpTrue);
*/

/// Extended point query info struct. Returned from calling pointQuery on a shape.
var PointQueryExtendedInfo = function(shape){
	/// Shape that was hit, NULL if no collision occurred.
	this.shape = shape;
	/// Depth of the point inside the shape.
	this.d = Infinity;
	/// Direction of minimum norm to the shape's surface.
	this.n = vzero;
};

var SegmentQueryInfo = function(shape, t, n){
	/// The shape that was hit, NULL if no collision occured.
	this.shape = shape;
	/// The normalized distance along the query segment in the range [0, 1].
	this.t = t;
	/// The normal of the surface hit.
	this.n = n;
};

// Circles.

var CircleShape = exports.CircleShape = function(body, radius, offset)
{
	this.c = this.tc = offset;
	this.r = radius;
	
	this.type = 'circle';

	Shape.call(this, body);
};

CircleShape.prototype = Object.create(Shape.prototype);

CircleShape.prototype.cacheData = function(p, rot)
{
	var c = this.tc = vadd(p, vrotate(this.c, rot));
	return bbNewForCircle(c, this.r);
};

/// Test if a point lies within a shape.
CircleShape.prototype.pointQuery = function(p)
{
	var delta = vsub(p, this.tc);
	var distsq = vlengthsq(delta);
	var r = this.r;
	
	if(distsq < r*r){
		var info = new PointQueryExtendedInfo(this);
		
		var dist = fsqrt(distsq);
		info.d = r - dist;
		info.n = vmult(delta, 1/dist);
		return info;
	}
};

var circleSegmentQuery = function(shape, center, r, a, b, info)
{
	// offset the line to be relative to the circle
	a = vsub(a, center);
	b = vsub(b, center);
	
	var qa = vdot(a, a) - 2*vdot(a, b) + vdot(b, b);
	var qb = -2*vdot(a, a) + 2*vdot(a, b);
	var qc = vdot(a, a) - r*r;
	
	var det = qb*qb - 4*qa*qc;
	
	if(det >= 0)
	{
		var t = (-qb - Math.sqrt(det))/(2*qa);
		if(0 <= t && t <= 1){
			return new SegmentQueryInfo(shape, t, vnormalize(vlerp(a, b, t)));
		}
	}
};

CircleShape.prototype.segmentQuery = function(a, b)
{
	return circleSegmentQuery(this, this.tc, this.r, a, b);
};

// The C API has these, and also getters. Its not idiomatic to
// write getters and setters in JS.
/*
CircleShape.prototype.setRadius = function(radius)
{
	this.r = radius;
}

CircleShape.prototype.setOffset = function(offset)
{
	this.c = offset;
}*/

// Segment shape

var SegmentShape = exports.SegmentShape = function(body, a, b, r)
{
	this.a = a;
	this.b = b;
	this.n = vperp(vnormalize(vsub(b, a)));

	this.ta = this.tb = this.tn = null;
	
	this.r = r;
	
	this.a_tangent = vzero;
	this.b_tangent = vzero;
	
	this.type = 'segment';
	Shape.call(this, body);
};

SegmentShape.prototype = Object.create(Shape.prototype);

SegmentShape.prototype.cacheData = function(p, rot)
{
	this.ta = vadd(p, vrotate(this.a, rot));
	this.tb = vadd(p, vrotate(this.b, rot));
	this.tn = vrotate(this.n, rot);
	
	var l,r,b,t;
	
	if(this.ta.x < this.tb.x){
		l = this.ta.x;
		r = this.tb.x;
	} else {
		l = this.tb.x;
		r = this.ta.x;
	}
	
	if(this.ta.y < this.tb.y){
		b = this.ta.y;
		t = this.tb.y;
	} else {
		b = this.tb.y;
		t = this.ta.y;
	}
	
	var rad = this.r;
	return new BB(l - rad, b - rad, r + rad, t + rad);
};

SegmentShape.prototype.pointQuery = function(p)
{
	if(!bbContainsVect(this.bb, p)) return;
	
	var a = this.ta;
	var b = this.tb;
	
	var seg_delta = vsub(b, a);
	var closest_t = fclamp01(vdot(seg_delta, vsub(p, a))/vlengthsq(seg_delta));
	var closest = vadd(a, vmult(seg_delta, closest_t));

	var delta = vsub(p, closest);
	var distsq = vlengthsq(delta);
	var r = this.r;

	if (distsq < r*r){
		var info = new PointQueryExtendedInfo(this);

		var dist = Math.sqrt(distsq);
		info.d = r - dist;
		info.n = vmult(delta, 1/dist);
		return info;
	}
};

SegmentShape.prototype.segmentQuery = function(a, b)
{
	var n = this.tn;
	var d = vdot(vsub(this.ta, a), n);
	var r = this.r;
	
	var flipped_n = (d > 0 ? vneg(n) : n);
	var n_offset = vsub(vmult(flipped_n, r), a);
	
	var seg_a = vadd(this.ta, n_offset);
	var seg_b = vadd(this.tb, n_offset);
	var delta = vsub(b, a);
	
	if(vcross(delta, seg_a)*vcross(delta, seg_b) <= 0){
		var d_offset = d + (d > 0 ? -r : r);
		var ad = -d_offset;
		var bd = vdot(delta, n) - d_offset;
		
		if(ad*bd < 0){
			return {
				shape: this,
				t: ad/(ad - bd),
				n: flipped_n
			};
		}
	} else if(r != 0){
		var info1 = circleSegmentQuery(this, this.ta, this.r, a, b);
		var info2 = circleSegmentQuery(this, this.tb, this.r, a, b);
		
		if (info1){
			return info2 && info2.t < info1.t ? info2 : info1;
		} else {
			return info2;
		}
	}
};

SegmentShape.prototype.setNeighbors = function(prev, next)
{
	this.a_tangent = vsub(prev, this.a);
	this.b_tangent = vsub(next, this.b);
};

SegmentShape.prototype.setEndpoints = function(a, b)
{
	this.a = a;
	this.b = b;
	this.n = vperp(vnormalize(vsub(b, a)));
};

/*
cpSegmentShapeSetRadius(cpShape *shape, cpFloat radius)
{
	this.r = radius;
}*/

/*
CP_DeclareShapeGetter(cpSegmentShape, cpVect, A);
CP_DeclareShapeGetter(cpSegmentShape, cpVect, B);
CP_DeclareShapeGetter(cpSegmentShape, cpVect, Normal);
CP_DeclareShapeGetter(cpSegmentShape, cpFloat, Radius);
*/

/// Get the hit point for a segment query.
exports.segmentQueryHitPoint = function(start, end, info)
{
	return vlerp(start, end, info.t);
};

/// Get the hit distance for a segment query.
exports.segmentQueryHitDist = function(start, end, info)
{
	return vdist(start, end)*info.t;
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
 
/// Check that a set of vertexes is convex and has a clockwise winding.
var polyValidate = function(verts)
{
	var numVerts = verts.length;
	for(var i=0; i<numVerts; i++){
		var a = verts[i];
		var b = verts[(i+1)%numVerts];
		var c = verts[(i+2)%numVerts];
		
		if(vcross(vsub(b, a), vsub(c, b)) > 0){
			return false;
		}
	}
	
	return true;
};

/// Initialize a polygon shape.
/// The vertexes must be convex and have a clockwise winding.
var PolyShape = exports.PolyShape = function(body, verts, offset)
{
	// Fail if the user attempts to pass a concave poly, or a bad winding.
	assert(polyValidate(verts), "Polygon is concave or has a reversed winding.");
	
	this.setVerts(verts, offset);
	this.type = 'poly';
	Shape.call(this, body);
};

PolyShape.prototype = Object.create(Shape.prototype);

var Axis = function(n, d) {
	this.n = n;
	this.d = d;
};

PolyShape.prototype.setVerts = function(verts, offset)
{
	var numVerts = verts.length;

	// This a pretty bad way to do this in javascript. As a first pass, I want to keep
	// the code similar to the C.
	this.verts = new Array(numVerts);
	this.tVerts = new Array(numVerts);

	this.axes = new Array(numVerts);
	this.tAxes = new Array(numVerts);
	
	for(var i=0; i<numVerts; i++){
		var a = vadd(offset, verts[i]);
		var b = vadd(offset, verts[(i+1)%numVerts]);
		var n = vnormalize(vperp(vsub(b, a)));

		this.verts[i] = a;
		this.axes[i] = new Axis(n, vdot(n, a));
		this.tAxes[i] = new Axis(vzero, 0);
	}
};

/// Initialize a box shaped polygon shape.
var BoxShape = exports.BoxShape = function(body, width, height)
{
	var hw = width/2;
	var hh = height/2;
	
	return BoxShape2(body, new BB(-hw, -hh, hw, hh));
};

/// Initialize an offset box shaped polygon shape.
var BoxShape2 = exports.BoxShape2 = function(body, box)
{
	var verts = [
		new Vect(box.l, box.b),
		new Vect(box.l, box.t),
		new Vect(box.r, box.t),
		new Vect(box.r, box.b),
	];
	
	return new PolyShape(body, verts, vzero);
};

PolyShape.prototype.transformVerts = function(p, rot)
{
	var src = this.verts;
	var dst = this.tVerts;
	
	var l = Infinity, r = -Infinity;
	var b = Infinity, t = -Infinity;
	
	for(var i=0; i<src.length; i++){
		var v = vadd(p, vrotate(src[i], rot));
		
		dst[i] = v;
		l = min(l, v.x);
		r = max(r, v.x);
		b = min(b, v.y);
		t = max(t, v.y);
	}
	
	return this.bb = new BB(l, b, r, t);
};

PolyShape.prototype.transformAxes = function(p, rot)
{
	var src = this.axes;
	var dst = this.tAxes;
	
	for(var i=0; i<src.length; i++){
		var n = vrotate(src[i].n, rot);
		dst[i].n = n;
		dst[i].d = vdot(p, n) + src[i].d;
	}
};

PolyShape.prototype.cacheData = function(p, rot)
{
	this.transformAxes(p, rot);
	return this.transformVerts(p, rot);
};

PolyShape.prototype.pointQuery = function(p)
{
	if(!bbContainsVect(this.shape.bb, p)) return;
	
	var info = new PointQueryExtendedInfo(this);
	
	var axes = this.tAxes;
	for(var i=0; i<axes.length; i++){
		var n = axes[i].n;
		var dist = axes[i].d - vdot(n, p);
		
		if(dist < 0){
			return;
		} else if(dist < info.d){
			info.d = dist;
			info.n = n;
		}
	}
	
	return info;
};

PolyShape.prototype.segmentQuery = function(a, b)
{
	var axes = this.tAxes;
	var verts = this.tVerts;
	var numVerts = this.verts.length;
	
	for(var i=0; i<numVerts; i++){
		var n = axes[i].n;
		var an = vdot(a, n);
		if(axes[i].d > an) continue;
		
		var bn = vdot(b, n);
		var t = (axes[i].d - an)/(bn - an);
		if(t < 0 || 1 < t) continue;
		
		var point = vlerp(a, b, t);
		var dt = -vcross(n, point);
		var dtMin = -vcross(n, verts[i]);
		var dtMax = -vcross(n, verts[(i+1)%numVerts]);
		
		if(dtMin <= dt && dt <= dtMax){
			// josephg: In the original C code, this function keeps
			// looping through axes after finding a match. I *think*
			// this code is equivalent...
			return new SegmentQueryInfo(this, t, n);
		}
	}
};

/*
PolyShape.getNumVerts = function()
{
	return this.verts.length;
};*/

PolyShape.prototype.getVert = function(idx)
{
	return this.verts[idx];
};

PolyShape.prototype.valueOnAxis = function(n, d)
{
	var verts = this.tVerts;
	var m = vdot(n, verts[0]);
	
	for(var i=1; i<verts.length; i++){
		m = min(m, vdot(n, verts[i]));
	}
	
	return m - d;
};

PolyShape.prototype.containsVert = function(v)
{
	var axes = this.tAxes;
	
	for(var i=0; i<axes.length; i++){
		var dist = vdot(axes[i].n, v) - axes[i].d;
		if(dist > 0) return false;
	}
	
	return true;
};

PolyShape.prototype.containsVertPartial = function(v, n)
{
	var axes = this.tAxes;
	
	for(var i=0; i<axes.length; i++){
		if(vdot(axes[i].n, n) < 0) continue;
		var dist = vdot(axes[i].n, v) - axes[i].d;
		if(dist > 0) return false;
	}
	
	return true;
};


/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// @defgroup cpBody cpBody
/// Chipmunk's rigid body type. Rigid bodies hold the physical properties of an object like
/// it's mass, and position and velocity of it's center of gravity. They don't have an shape on their own.
/// They are given a shape by creating collision shapes (cpShape) that point to the body.
/// @{

var Body = exports.Body = function(m, i) {
	/// Function that is called to update the body's velocity.
	/// Override this to customize movement. Defaults to body.updateVelocity
	/// body.velocity_func(gravity, damping, dt);
	Body.prototype.velocity_func = Body.prototype.updateVelocity;

	/// Function that is called to update the body's position.
	/// Override this to customize movement. Defaults to body.updatePosition
	/// body.position_func(dt);
	Body.prototype.position_func = Body.prototype.updatePosition;

	/// Mass of the body.
	/// Must agree with cpBody.m_inv! Use body.setMass() when changing the mass for this reason.
	//this.m;
	/// Mass inverse.
	//this.m_inv;
	
	/// Moment of inertia of the body.
	/// Must agree with cpBody.i_inv! Use body.setMoment() when changing the moment for this reason.
	//this.i;
	/// Moment of inertia inverse.
	//this.i_inv;

	/// Position of the rigid body's center of gravity.
	this.p = new Vect(0,0);
	/// Velocity of the rigid body's center of gravity.
	this.v = new Vect(0,0);
	/// Force acting on the rigid body's center of gravity.
	this.f = new Vect(0,0);
	
	/// Rotation of the body around it's center of gravity in radians.
	/// Must agree with cpBody.rot! Use cpBodySetAngle() when changing the angle for this reason.
	//this.a;
	/// Angular velocity of the body around it's center of gravity in radians/second.
	this.w = 0;
	/// Torque applied to the body around it's center of gravity.
	this.t = 0;
	
	/// Cached unit length vector representing the angle of the body.
	/// Used for fast rotations using cpvrotate().
	//cpVect rot;
	
	/// Maximum velocity allowed when updating the velocity.
	this.v_limit = Infinity;
	/// Maximum rotational rate (in radians/second) allowed when updating the angular velocity.
	this.w_limit = Infinity;
	
	// This stuff is all private.
	this.v_bias = new Vect(0,0);
	this.w_bias = 0;
	
	this.space = null;
	
	this.shapeList = [];
	this.arbiterList = null; // These are both wacky linked lists.
	this.constraintList = null;
	
	// This stuff is used to track information on the collision graph.
	this.nodeRoot = null;
	this.nodeNext = null;
	this.nodeIdleTime = 0;

	// Set this.m and this.m_inv
	this.setMass(m);

	// Set this.i and this.i_inv
	this.setMoment(i);

	// Set this.a and this.rot
	this.setAngle(0);
};

// I wonder if this should use the constructor style like Body...
var createStaticBody = function()
{
	body = new Body(Infinity, Infinity);
	body.nodeIdleTime = Infinity;

	return body;
};

if (typeof DEBUG !== 'undefined' && DEBUG) {
	var v_assert_nan = function(v, message){assert(v.x == v.x && v.y == v.y, message); };
	var v_assert_infinite = function(v, message){assert(Math.abs(v.x) !== Infinity && Math.abs(v.y) !== Infinity, message);};
	var v_assert_sane = function(v, message){v_assert_nan(v, message); v_assert_infinite(v, message);};

	Body.prototype.sanityCheck = function()
	{
		assert(this.m === this.m && this.m_inv === this.m_inv, "Body's mass is invalid.");
		assert(this.i === this.i && this.i_inv === this.i_inv, "Body's moment is invalid.");
		
		v_assert_sane(this.p, "Body's position is invalid.");
		v_assert_sane(this.v, "Body's velocity is invalid.");
		v_assert_sane(this.f, "Body's force is invalid.");

		assert(this.a === this.a && Math.abs(this.a) !== Infinity, "Body's angle is invalid.");
		assert(this.w === this.w && Math.abs(this.w) !== Infinity, "Body's angular velocity is invalid.");
		assert(this.t === this.t && Math.abs(this.t) !== Infinity, "Body's torque is invalid.");
		
		v_assert_sane(this.rot, "Internal error: Body's rotation vector is invalid.");
		
		assert(this.v_limit === this.v_limit, "Body's velocity limit is invalid.");
		assert(this.w_limit === this.w_limit, "Body's angular velocity limit is invalid.");
	};
} else {
	Body.prototype.sanityCheck = function(){};
}

/// Returns true if the body is sleeping.
Body.prototype.isSleeping = function()
{
	return this.nodeRoot !== null;
};

/// Returns true if the body is static.
Body.prototype.isStatic = function()
{
	return this.nodeIdleTime === Infinity;
};

/// Returns true if the body has not been added to a space.
Body.prototype.isRogue = function()
{
	return this.space === null;
};

// It would be nicer to use defineProperty for this, but its about 30x slower:
// http://jsperf.com/defineproperty-vs-setter
Body.prototype.setMass = function(mass)
{
	assert(mass > 0, "Mass must be positive and non-zero.");

	//activate is defined in cpSpaceComponent
	this.activate();
	this.m = mass;
	this.m_inv = 1/mass;
};

Body.prototype.setMoment = function(moment)
{
	assert(moment > 0, "Moment of Inertia must be positive and non-zero.");

	this.activate();
	this.i = moment;
	this.i_inv = 1/moment;
};

Body.prototype.addShape = function(shape)
{
	this.shapeList.push(shape);
};

Body.prototype.removeShape = function(shape)
{
	// This implementation has a linear time complexity with the number of shapes.
	// The original implementation used linked lists instead, which might be faster if
	// you're constantly editing the shape of a body. I expect most bodies will never
	// have their shape edited, so I'm just going to use the simplest possible implemention.
	deleteObjFromList(this.shapeList, shape);
};

var filterConstraints = function(node, body, filter)
{
	if(node == filter){
		return node.next(body);
	} else if(node.a === body){
		node.next_a = filterConstraints(node.next_a, body, filter);
	} else {
		node.next_b = filterConstraints(node.next_b, body, filter);
	}
	
	return node;
};

Body.prototype.removeConstraint = function(constraint)
{
	// The constraint must be in the constraints list when this is called.
	this.constraintList = filterConstraints(this.constraintList, this, constraint);
};

Body.prototype.setPos = function(pos)
{
	this.activate();
	this.sanityCheck();
	this.p = pos;
};

Body.prototype.setAngleInternal = function(angle)
{
	assert(!isNaN(angle), "Internal Error: Attempting to set body's angle to NaN");
	this.a = angle;//fmod(a, (cpFloat)M_PI*2.0f);
	this.rot = vforangle(angle);
};

Body.prototype.setAngle = function(angle)
{
	this.activate();
	this.sanityCheck();
	this.setAngleInternal(angle);
}

Body.prototype.updateVelocity = function(gravity, damping, dt)
{
	this.v = vclamp(vadd(vmult(this.v, damping), vmult(vadd(gravity, vmult(this.f, this.m_inv)), dt)), this.v_limit);
	
	var w_limit = this.w_limit;
	this.w = clamp(this.w*damping + this.t*this.i_inv*dt, -w_limit, w_limit);
	
	this.sanityCheck();
};

Body.prototype.updatePosition = function(dt)
{
	this.p = vadd(this.p, vmult(vadd(this.v, this.v_bias), dt));
	this.setAngleInternal(this.a + (this.w + this.w_bias)*dt);
	
	this.v_bias = new Vect(0,0);
	this.w_bias = 0;
	
	this.sanityCheck();
};

Body.prototype.resetForces = function()
{
	this.activate();
	this.f = new Vect(0,0);
	this.t = 0;
};

Body.prototype.applyForce = function(force, r)
{
	this.activate();
	this.f = vadd(this.f, force);
	this.t += vcross(r, force);
};

Body.prototype.applyImpulse = function(j, r)
{
	this.activate();
	apply_impulse(this, j.x, j.y, r);
};

Body.prototype.getVelAtPoint = function(r)
{
	return vadd(this.v, vmult(vperp(r), body.w));
};

/// Get the velocity on a body (in world units) at a point on the body in world coordinates.
Body.prototype.getVelAtWorldPoint = function(point)
{
	return this.getVelAtPoint(vsub(point, body.p));
};

/// Get the velocity on a body (in world units) at a point on the body in local coordinates.
Body.prototype.getVelAtLocalPoint = function(point)
{
	return this.getVelAtPoint(vrotate(point, body.rot));
}

Body.prototype.eachShape = function(func)
{
	for(var i = 0, len = this.shapeList.length; i < len; i++) {
		func(this.shapeList[i]);
	}
};

Body.prototype.eachConstraint = function(func)
{
	var constraint = this.constraintList;
	while(constraint) {
		var next = constraint.next(body);
		func(constraint);
		constraint = next;
	}
};

Body.prototype.eachArbiter = function(func)
{
	var arb = this.arbiterList;
	while(arb){
		var next = arb.next(body);
		
		arb.swappedColl = (this === arb.body_b);
		func(arb);
		
		arb = next;
	}
};

/// Convert body relative/local coordinates to absolute/world coordinates.
Body.prototype.local2World = function(v)
{
	return vadd(this.p, vrotate(v, this.rot));
};

/// Convert body absolute/world coordinates to	relative/local coordinates.
Body.prototype.world2Local = function(v)
{
	return vunrotate(vsub(v, this.p), this.rot);
};

/// Get the kinetic energy of a body.
Body.prototype.kineticEnergy = function()
{
	// Need to do some fudging to avoid NaNs
	var vsq = vdot(this.v, this.v);
	var wsq = this.w * this.w;
	return (vsq ? vsq*this.m : 0) + (wsq ? wsq*this.i : 0);
};
/* Copyright (c) 2010 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
	@defgroup cpSpatialIndex cpSpatialIndex
	
	Spatial indexes are data structures that are used to accelerate collision detection
	and spatial queries. Chipmunk provides a number of spatial index algorithms to pick from
	and they are programmed in a generic way so that you can use them for holding more than
	just Shapes.
	
	It works by using pointers to the objects you add and using a callback to ask your code
	for bounding boxes when it needs them. Several types of queries can be performed an index as well
	as reindexing and full collision information. All communication to the spatial indexes is performed
	through callback functions.
	
	Spatial indexes should be treated as opaque structs.
	This means you shouldn't be reading any of the fields directly.

	All spatial indexes define the following methods:
		
	// Get the number of objects in the spatial index.
	count();

	// Iterate the objects in the spatial index. @c func will be called once for each object.
	each(func);
	
	// Returns true if the spatial index contains the given object.
	// Most spatial indexes use hashed storage, so you must provide a hash value too.
	contains(obj, hashid);

	// Add an object to a spatial index.
	insert(obj, hashid);

	// Remove an object from a spatial index.
	remove(obj, hashid);
	
	// Perform a full reindex of a spatial index.
	reindex();

	// Reindex a single object in the spatial index.
	reindexObject(obj, hashid);

	// Perform a point query against the spatial index, calling @c func for each potential match.
	// A pointer to the point will be passed as @c obj1 of @c func.
	// func(shape);
	pointQuery(point, func);

	// Perform a segment query against the spatial index, calling @c func for each potential match.
	// func(shape);
	segmentQuery(vect a, vect b, t_exit, func);

	// Perform a rectangle query against the spatial index, calling @c func for each potential match.
	// func(shape);
	query(bb, func);

	// Simultaneously reindex and find all colliding objects.
	// @c func will be called once for each potentially overlapping pair of objects found.
	// If the spatial index was initialized with a static index, it will collide it's objects against that as well.
	reindexQuery(func);
*/

var SpatialIndex = exports.SpatialIndex = function(bbfunc, staticIndex)
{
	this.bbfunc = bbfunc;
	this.staticIndex = staticIndex;
	
	if(staticIndex){
		assert(!staticIndex.dynamicIndex, "This static index is already associated with a dynamic index.");
		staticIndex.dynamicIndex = this;
	}
};

// Collide the objects in an index against the objects in a staticIndex using the query callback function.
SpatialIndex.prototype.collideStatic = function(staticIndex, func)
{
	if(staticIndex.count > 0){
		var bbfunc = this.bbfunc,
			query = staticIndex.query;

		this.each(function(obj) {
			query(obj, bbfunc(obj), func);
		});
	}
};


/* Copyright (c) 2009 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// This file implements a modified AABB tree for collision detection.

var BBTree = exports.BBTree = function(bbfunc, staticIndex)
{
	SpatialIndex.call(this, bbfunc, staticIndex);
	
	this.velocityFunc = null;

	// This is a hash from object ID -> object for the objects stored in the BBTree.
	this.leaves = {};
	// A count of the number of leaves in the BBTree.
	this.count = 0;

	this.root = null;
	
	// An object pool of tree nodes and pairs.
	//this.pooledNodes = [];
	//this.pooledPairs = [];
	
	this.stamp = 0;
};

BBTree.prototype = Object.create(SpatialIndex.prototype);

var numNodes = 0;

var Node = function(tree, a, b)
{
	//Node *node = NodeFromPool(tree);
	this.obj = null;
	this.bb = bbMerge(a.bb, b.bb);
	this.parent = null;
	
	this.setA(a);
	this.setB(b);
	numNodes++;
};

var numLeaves = 0;
var Leaf = function(tree, obj)
{
	//Node *node = NodeFromPool(tree);

	this.obj = obj;
	this.bb = tree.getBB(obj);
	this.parent = null;

	this.stamp = 1;
	this.pairs = null;
	numLeaves++;
};

// **** Misc Functions

BBTree.prototype.getBB = function(obj)
{
	var bb = this.bbfunc(obj);
	
	var velocityFunc = this.velocityFunc;
	if(velocityFunc){
		var coef = 0.1;
		var x = (bb.r - bb.l)*coef;
		var y = (bb.t - bb.b)*coef;
		
		var v = vmult(velocityFunc(obj), 0.1);
		return bbNew(
				bb.l + min(-x, v.x),
				bb.b + min(-y, v.y),
				bb.r + max(x, v.x),
				bb.t + max(y, v.y)
			);
	} else {
		return bb;
	}
};

BBTree.prototype.getStamp = function()
{
	var dynamic = this.dynamicIndex;
	return (dynamic && dynamic.stamp ? dynamic.stamp : this.stamp);
};

BBTree.prototype.incrementStamp = function()
{
	if(this.dynamicIndex && this.dynamicIndex.stamp){
		this.dynamicIndex.stamp++;
	} else {
		this.stamp++;
	}
}

// **** Pair/Thread Functions

// Objects created with constructors are faster than object literals. :(
var Pair = function(a, b)
{
	this.a = a; this.b = b;
};

var Thread = function(leaf, next)
{
	this.prev = null;
	this.next = next;
	this.leaf = leaf;
};

// Benchmark this code with object pools on & off.
/*
BBTree.prototype.pairRecycle = function(pair)
{
	this.pooledPairs.push(pair);
};

BBTree.prototype.pairFromPool = function()
{
	return this.pooledPairs.pop() || new Pair(null, null);
};
*/

Thread.prototype.unlink = function()
{
	var next = this.next;
	var prev = this.prev;
	
	if(next){
		if(next.a.leaf == this.leaf) next.a.prev = prev; else next.b.prev = prev;
	}
	
	if(prev){
		if(prev.a.leaf == this.leaf) prev.a.next = next; else prev.b.next = next;
	} else {
		this.leaf.pairs = next;
	}
};

Leaf.prototype.clearPairs = function(tree)
{
	var pair = this.pairs,
		next;

	this.pairs = null;
	
	while(pair){
		if(pair.a.leaf == this){
			next = pair.a.next;
			pair.b.unlink();
			//tree.pairRecycle(pair);
			pair = next;
		} else {
			next = pair.b.next;
			pair.a.unlink();
			//tree.pairRecycle(pair);
			pair = next;
		}
	}
}

var pairInsert = function(a, b, tree)
{
	var nextA = a.pairs, nextB = b.pairs;
	var pair = new Pair(new Thread(a, nextA), new Thread(b, nextB));
	a.pairs = b.pairs = pair;

	//var pair = tree.pairFromPool();
	//Pair temp = {{null, a, nextA},{null, b, nextB}};
	//*pair = temp;
	
	if(nextA){
		if(nextA.a.leaf == a) nextA.a.prev = pair; else nextA.b.prev = pair;
	}
	
	if(nextB){
		if(nextB.a.leaf == b) nextB.a.prev = pair; else nextB.b.prev = pair;
	}
};

// **** Node Functions

/*
static void
NodeRecycle(bbTree *tree, Node *node)
{
	node.parent = tree.pooledNodes;
	tree.pooledNodes = node;
}

static Node *
NodeFromPool(bbTree *tree)
{
	Node *node = tree.pooledNodes;
	
	if(node){
		tree.pooledNodes = node.parent;
		return node;
	} else {
		// Pool is exhausted, make more
	}
}*/

Node.prototype.setA = function(value)
{
	this.A = value;
	value.parent = this;
};

Node.prototype.setB = function(value)
{
	this.B = value;
	value.parent = this;
};

/*
static inline cpBool
NodeIsLeaf(Node *node)
{
	return (node.obj != null);
}*/
Leaf.prototype.isLeaf = true;
Node.prototype.isLeaf = false;

Node.prototype.otherChild = function(child)
{
	return (this.A == child ? this.B : this.A);
};

Node.prototype.replaceChild = function(child, value, tree)
{
	assertSoft(child == this.A || child == this.B, "Node is not a child of parent.");
	
	if(this.A == child){
		//NodeRecycle(tree, parent.A);
		this.setA(value);
	} else {
		//NodeRecycle(tree, parent.B);
		this.setB(value);
	}
	
	for(var node=this; node; node = node.parent){
		node.bb = bbMerge(node.A.bb, node.B.bb);
	}
};

// **** Subtree Functions

// Would it be better to make these functions instance methods on Node and Leaf?

var bbProximity = function(a, b)
{
	return Math.abs(a.l + a.r - b.l - b.r) + Math.abs(a.b + b.t - b.b - b.t);
}

var subtreeInsert = function(subtree, leaf, tree)
{
	if(subtree == null){
		return leaf;
	} else if(subtree.isLeaf){
		return new Node(tree, leaf, subtree);
	} else {
		var cost_a = bbArea(subtree.B.bb) + bbMergedArea(subtree.A.bb, leaf.bb);
		var cost_b = bbArea(subtree.A.bb) + bbMergedArea(subtree.B.bb, leaf.bb);
		
		if(cost_a === cost_b){
			cost_a = bbProximity(subtree.A.bb, leaf.bb);
			cost_b = bbProximity(subtree.B.bb, leaf.bb);
		}	

		if(cost_b < cost_a){
			subtree.setB(subtreeInsert(subtree.B, leaf, tree));
		} else {
			subtree.setA(subtreeInsert(subtree.A, leaf, tree));
		}
		
		subtree.bb = bbMerge(subtree.bb, leaf.bb);
		return subtree;
	}
};

var subtreeQuery = function(subtree, bb, func)
{
	if(bbIntersects(subtree.bb, bb)){
		if(subtree.isLeaf){
			func(subtree.obj);
		} else {
			subtreeQuery(subtree.A, bb, func);
			subtreeQuery(subtree.B, bb, func);
		}
	}
};

var subtreeSegmentQuery = function(subtree, a, b, t_exit, func)
{
	if(subtree.isLeaf){
		return func(subtree.obj);
	} else {
		var t_a = bbSegmentQuery(subtree.A.bb, a, b);
		var t_b = bbSegmentQuery(subtree.B.bb, a, b);
		
		if(t_a < t_b){
			if(t_a < t_exit) t_exit = min(t_exit, subtreeSegmentQuery(subtree.A, a, b, t_exit, func, data));
			if(t_b < t_exit) t_exit = min(t_exit, subtreeSegmentQuery(subtree.B, a, b, t_exit, func, data));
		} else {
			if(t_b < t_exit) t_exit = min(t_exit, subtreeSegmentQuery(subtree.B, a, b, t_exit, func, data));
			if(t_a < t_exit) t_exit = min(t_exit, subtreeSegmentQuery(subtree.A, a, b, t_exit, func, data));
		}
		
		return t_exit;
	}
};

/*
static void
SubtreeRecycle(bbTree *tree, Node *node)
{
	if(!NodeIsLeaf(node)){
		SubtreeRecycle(tree, node.A);
		SubtreeRecycle(tree, node.B);
		NodeRecycle(tree, node);
	}
}*/

var subtreeRemove = function(subtree, leaf, tree)
{
	if(leaf == subtree){
		return null;
	} else {
		var parent = leaf.parent;
		if(parent == subtree){
			var other = subtree.otherChild(leaf);
			other.parent = subtree.parent;
			//NodeRecycle(tree, subtree);
			return other;
		} else {
			parent.parent.replaceChild(parent, parent.otherChild(leaf), tree);
			return subtree;
		}
	}
};

// **** Marking Functions

/*
typedef struct MarkContext {
	bbTree *tree;
	Node *staticRoot;
	cpSpatialIndexQueryFunc func;
} MarkContext;
*/

var markLeafQuery = function(subtree, leaf, left, tree, func)
{
	if(bbIntersects(leaf.bb, subtree.bb)){
		if(subtree.isLeaf){
			if(left){
				pairInsert(leaf, subtree, tree);
			} else {
				if(subtree.stamp < leaf.stamp) pairInsert(subtree, leaf, tree);
				if(func) func(leaf.obj, subtree.obj);
			}
		} else {
			markLeafQuery(subtree.A, leaf, left, tree, func);
			markLeafQuery(subtree.B, leaf, left, tree, func);
		}
	}
};

var markLeaf = function(leaf, tree, staticRoot, func)
{
	if(leaf.stamp == tree.getStamp()){
		if(staticRoot) markLeafQuery(staticRoot, leaf, false, tree, func);
		
		for(var node = leaf; node.parent; node = node.parent){
			if(node == node.parent.A){
				markLeafQuery(node.parent.B, leaf, true, tree, func);
			} else {
				markLeafQuery(node.parent.A, leaf, false, tree, func);
			}
		}
	} else {
		var pair = leaf.pairs;
		while(pair){
			if(leaf == pair.b.leaf){
				if(func) func(pair.a.leaf.obj, leaf.obj);
				pair = pair.b.next;
			} else {
				pair = pair.a.next;
			}
		}
	}
};

var markSubtree = function(subtree, tree, staticRoot, func)
{
	if(subtree.isLeaf){
		markLeaf(subtree, tree, staticRoot, func);
	} else {
		markSubtree(subtree.A, tree, staticRoot, func);
		markSubtree(subtree.B, tree, staticRoot, func);
	}
};

// **** Leaf Functions

Leaf.prototype.update = function(tree)
{
	var root = tree.root;
	var bb = tree.bbfunc(this.obj);
	
	if(!bbContainsBB(this.bb, bb)){
		this.bb = tree.getBB(this.obj);
		
		root = subtreeRemove(root, this, tree);
		tree.root = subtreeInsert(root, this, tree);
		
		this.clearPairs(tree);
		this.stamp = tree.getStamp();
		
		return true;
	}
	
	return false;
};

Leaf.prototype.addPairs = function(tree)
{
	var dynamicIndex = tree.dynamicIndex;
	if(dynamicIndex){
		var dynamicRoot = dynamicIndex.root;
		if(dynamicRoot){
			markLeafQuery(dynamicRoot, this, true, dynamicIndex, null);
		}
	} else {
		var staticRoot = tree.staticIndex.root;
		markLeaf(this, tree, staticRoot, null);
	}
};

// **** Insert/Remove

BBTree.prototype.insert = function(obj, hashid)
{
	var leaf = new Leaf(this, obj);

	this.leaves[hashid] = leaf;
	this.root = subtreeInsert(this.root, leaf, this);
	this.count++;
	
	leaf.stamp = this.getStamp();
	leaf.addPairs(this);
	this.incrementStamp();
};

BBTree.prototype.remove = function(obj, hashid)
{
	var leaf = this.leaves[hashid];

	delete this.leaves[hashid];
	this.root = subtreeRemove(this.root, leaf, this);
	this.count--;

	leaf.clearPairs(this);
	//NodeRecycle(tree, leaf);
};

BBTree.prototype.contains = function(obj, hashid)
{
	return this.leaves[hashid] != null;
};

// **** Reindex
var voidQueryFunc = function(obj1, obj2){};

BBTree.prototype.reindexQuery = function(func)
{
	if(!this.root) return;
	
	// LeafUpdate() may modify this.root. Don't cache it.
	var hashid,
		leaves = this.leaves;
	for (hashid in leaves)
	{
		leaves[hashid].update(this);
	}
	
	var staticIndex = this.staticIndex;
	var staticRoot = staticIndex && staticIndex.root;
	
	markSubtree(this.root, this, staticRoot, func);
	if(staticIndex && !staticRoot) this.collideStatic(this, staticIndex, func);
	
	this.incrementStamp();
};

BBTree.prototype.reindex = function()
{
	this.reindexQuery(voidQueryFunc);
};

BBTree.prototype.reindexObject = function(obj, hashid)
{
	var leaf = this.leaves[hashid];
	if(leaf){
		if(leaf.update(this)) leaf.addPairs(this);
		this.incrementStamp();
	}
};

// **** Query

BBTree.prototype.pointQuery = function(point, func)
{
	// The base collision object is the provided point.
	if(this.root) subtreeQuery(this.root, new BB(point.x, point.y, point.x, point.y), func);
};

BBTree.prototype.segmentQuery = function(a, b, t_exit, func)
{
	if(this.root) subtreeSegmentQuery(this, a, b, t_exit, func);
};

BBTree.prototype.query = function(bb, func)
{
	if(this.root) subtreeQuery(this.root, bb, func);
};

// **** Misc

BBTree.prototype.count = function()
{
	return this.count;
};

BBTree.prototype.each = function(func)
{
	var hashid;
	for(hashid in this.leaves)
	{
		func(this.leaves[hashid].obj);
	}
};

// **** Tree Optimization

var partitionNodes = function(tree, nodes, offset, count)
{
	if(count == 1){
		return nodes[offset];
	} else if(count == 2) {
		return new Node(tree, nodes[offset], nodes[offset + 1]);
	}
	
	// Find the AABB for these nodes
	var bb = nodes[offset].bb;
	var end = offset + count;
	for(var i=offset + 1; i<end; i++) bb = bbMerge(bb, nodes[i].bb);
	
	// Split it on it's longest axis
	var splitWidth = (bb.r - bb.l > bb.t - bb.b);
	
	// Sort the bounds and use the median as the splitting point
	var bounds = new Array(count*2);
	if(splitWidth){
		for(var i=offset; i<end; i++){
			bounds[2*i + 0] = nodes[i].bb.l;
			bounds[2*i + 1] = nodes[i].bb.r;
		}
	} else {
		for(var i=offset; i<end; i++){
			bounds[2*i + 0] = nodes[i].bb.b;
			bounds[2*i + 1] = nodes[i].bb.t;
		}
	}
	
	bounds.sort(function(a, b) {
		// This might run faster if the function was moved out into the global scope.
		return a - b;
	});
	var split = (bounds[count - 1] + bounds[count])*0.5; // use the median as the split

	// Generate the child BBs
	var a = bb, b = bb;
	if(splitWidth) a.r = b.l = split; else a.t = b.b = split;
	
	// Partition the nodes
	var right = end;
	for(var left=offset; left < right;){
		var node = nodes[left];
		if(bbMergedArea(node.bb, b) < bbMergedArea(node.bb, a)){
//		if(bbProximity(node.bb, b) < bbProximity(node.bb, a)){
			right--;
			nodes[left] = nodes[right];
			nodes[right] = node;
		} else {
			left++;
		}
	}
	
	if(right == count){
		var node = null;
		for(var i=offset; i<end; i++) node = subtreeInsert(node, nodes[i], tree);
		return node;
	}
	
	// Recurse and build the node!
	return NodeNew(tree,
		partitionNodes(tree, nodes, offset, right - offset),
		partitionNodes(tree, nodes, right, end - right)
	);
};

//static void
//bbTreeOptimizeIncremental(bbTree *tree, int passes)
//{
//	for(int i=0; i<passes; i++){
//		Node *root = tree.root;
//		Node *node = root;
//		int bit = 0;
//		unsigned int path = tree.opath;
//		
//		while(!NodeIsLeaf(node)){
//			node = (path&(1<<bit) ? node.a : node.b);
//			bit = (bit + 1)&(sizeof(unsigned int)*8 - 1);
//		}
//		
//		root = subtreeRemove(root, node, tree);
//		tree.root = subtreeInsert(root, node, tree);
//	}
//}

BBTree.prototype.optimize = function()
{
	var nodes = new Array(this.count);
	var i = 0;

	for (var hashid in this.leaves)
	{
		nodes[i++] = this.nodes[hashid];
	}
	
	//SubtreeRecycle(tree, root);
	this.root = partitionNodes(tree, nodes, nodes.length);
};

// **** Debug Draw

var nodeRender = function(node, depth)
{
	if(!node.isLeaf && depth <= 10){
		nodeRender(node.a, depth + 1);
		nodeRender(node.b, depth + 1);
	}
	
	var bb = node.bb;
	
	var str = '';
	for(var i = 0; i < depth; i++) {
		str += ' ';
	}

	console.log(str + bb.b + ' ' + bb.t);
};

BBTree.prototype.log = function(){
	if(this.root) nodeRender(this.root, 0);
};

/*
static void
NodeRender(Node *node, int depth)
{
	if(!NodeIsLeaf(node) && depth <= 10){
		NodeRender(node.a, depth + 1);
		NodeRender(node.b, depth + 1);
	}
	
	bb bb = node.bb;
	
//	GLfloat v = depth/2.0f;	
//	glColor3f(1.0f - v, v, 0.0f);
	glLineWidth(max(5.0f - depth, 1.0f));
	glBegin(GL_LINES); {
		glVertex2f(bb.l, bb.b);
		glVertex2f(bb.l, bb.t);
		
		glVertex2f(bb.l, bb.t);
		glVertex2f(bb.r, bb.t);
		
		glVertex2f(bb.r, bb.t);
		glVertex2f(bb.r, bb.b);
		
		glVertex2f(bb.r, bb.b);
		glVertex2f(bb.l, bb.b);
	}; glEnd();
}

void
bbTreeRenderDebug(cpSpatialIndex *index){
	if(index.klass != &klass){
		cpAssertWarn(false, "Ignoring bbTreeRenderDebug() call to non-tree spatial index.");
		return;
	}
	
	bbTree *tree = (bbTree *)index;
	if(tree.root) NodeRender(tree.root, 0);
}
*/
/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// @defgroup cpArbiter cpArbiter
/// The cpArbiter struct controls pairs of colliding shapes.
/// They are also used in conjuction with collision handler callbacks
/// allowing you to retrieve information on the collision and control it.


// **** Collision Handlers
//
// Collision handlers are user-defined objects to describe the behaviour of colliding
// objects.
var CollisionHandler = exports.CollisionHandler = function()
{
	// The collision type
	this.a = this.b = 0;
};

/// Collision begin event callback
/// Returning false from a begin callback causes the collision to be ignored until
/// the the separate callback is called when the objects stop colliding.
CollisionHandler.prototype.begin = function(arb, space){return true;};

/// Collision pre-solve event callback
/// Returning false from a pre-step callback causes the collision to be ignored until the next step.
CollisionHandler.prototype.preSolve = function(arb, space){return true;};

/// Collision post-solve event function callback type.
CollisionHandler.prototype.postSolve = function(arb, space){};
/// Collision separate event function callback type.
CollisionHandler.prototype.separate = function(arb, space){};


var CP_MAX_CONTACTS_PER_ARBITER = 4;

// Arbiter states
//
// Arbiter is active and its the first collision.
//	'first coll'
// Arbiter is active and its not the first collision.
//	'normal',
// Collision has been explicitly ignored.
// Either by returning false from a begin collision handler or calling cpArbiterIgnore().
//	'ignore',
// Collison is no longer active. A space will cache an arbiter for up to cpSpace.collisionPersistence more steps.
//	'cached'

/// A colliding pair of shapes.
var Arbiter = function(a, b) {
	/// Calculated value to use for the elasticity coefficient.
	/// Override in a pre-solve collision handler for custom behavior.
	this.e = 0;
	/// Calculated value to use for the friction coefficient.
	/// Override in a pre-solve collision handler for custom behavior.
	this.u = 0;
	/// Calculated value to use for applying surface velocities.
	/// Override in a pre-solve collision handler for custom behavior.
	this.surface_vr = vzero;
	
	this.a = a; this.body_a = a.body;
	this.b = b; this.body_b = b.body;
	
	this.thread_a_next = this.thread_a_prev = null;
	this.thread_b_next = this.thread_b_prev = null;
	
	this.contacts = null;
	
	this.stamp = 0;
	this.handler = null;
	this.swappedColl = false;
	this.state = 'first coll';
};

/// Calculate the total impulse that was applied by this arbiter.
/// This function should only be called from a post-solve, post-step or cpBodyEachArbiter callback.
Arbiter.prototype.totalImpulse = function()
{
	var contacts = this.contacts;
	var sum = new Vect(0,0);
	
	for(var i=0, count=contacts.length; i<count; i++){
		var con = contacts[i];
		sum.add(vmult(con.n, con.jnAcc));
	}
	
	return this.swappedColl ? sum : sum.neg();
};

/// Calculate the total impulse including the friction that was applied by this arbiter.
/// This function should only be called from a post-solve, post-step or cpBodyEachArbiter callback.
Arbiter.prototype.totalImpulseWithFriction = function()
{
	var contacts = this.contacts;
	var sum = new Vect(0,0);
	
	for(var i=0, count=contacts.length; i<count; i++){
		var con = contacts[i];
		sum.add(new Vect(con.jnAcc, con.jtAcc).rotate(con.n));
	}

	return this.swappedColl ? sum : sum.neg();
};

// Calculate the amount of energy lost in a collision not including dynamic friction.
/// This function should only be called from a post-solve, post-step or cpBodyEachArbiter callback.
Arbiter.prototype.totalKE = function()
{
	var eCoef = (1 - arb.e)/(1 + arb.e);
	var sum = 0;
	
	var contacts = arb.contacts;
	for(var i=0, count=contacts.length; i<count; i++){
		var con = contacts[i];
		var jnAcc = con.jnAcc;
		var jtAcc = con.jtAcc;
		
		sum += eCoef*jnAcc*jnAcc/con.nMass + jtAcc*jtAcc/con.tMass;
	}
	
	return sum;
};

/// Causes a collision pair to be ignored as if you returned false from a begin callback.
/// If called from a pre-step callback, you will still need to return false
/// if you want it to be ignored in the current step.
Arbiter.prototype.ignore = function()
{
	this.state = 'ignore';
};

/// Return the colliding shapes involved for this arbiter.
/// The order of their cpSpace.collision_type values will match
/// the order set when the collision handler was registered.
Arbiter.prototype.getA = function()
{
	return this.swappedColl ? this.b : this.a;
};

Arbiter.prototype.getB = function()
{
	return this.swappedColl ? this.a : this.b;
};

/// Returns true if this is the first step a pair of objects started colliding.
Arbiter.prototype.isFirstContact = function()
{
	return this.state === 'first coll';
};

/// A struct that wraps up the important collision data for an arbiter.
var ContactPoint = function(point, normal, dist)
{
	this.point = point;
	this.normal = normal;
	this.dist = dist;
};

/// Return a contact set from an arbiter.
Arbiter.prototype.getContactPointSet = function()
{
	var set = new Array(this.contacts.length);
	
	var i;
	for(i=0; i<set.length; i++){
		set[i] = new ContactPoint(this.contacts[i].p, this.contacts[i].n, this.contacts[i].dist);
	}
	
	return set;
};

/// Get the normal of the @c ith contact point.
Arbiter.prototype.getNormal = function(i)
{
	var n = this.contacts[i].n;
	return this.swappedColl ? vneg(n) : n;
};

/// Get the position of the @c ith contact point.
Arbiter.prototype.getPoint = function(i)
{
	return this.contacts[i].p;
};

/// Get the depth of the @c ith contact point.
Arbiter.prototype.getDepth = function(i)
{
	return this.contacts[i].dist;
};

/*
Arbiter.prototype.threadForBody = function(body)
{
	return (this.body_a === body ? this.thread_a : this.thread_b);
};*/

var unthreadHelper = function(arb, body, prev, next)
{
	// thread_x_y is quite ugly, but it avoids making unnecessary js objects per arbiter.
	if(prev){
		// cpArbiterThreadForBody(prev, body)->next = next;
		if(prev.body_a === body) {
			prev.thread_a_next = next;
		} else {
			prev.thread_b_next = next;
		}
	} else {
		body.arbiterList = next;
	}
	
	if(next){
		// cpArbiterThreadForBody(next, body)->prev = prev;
		if(next.body_a === body){
			next.thread_a_prev = prev;
		} else {
			next.thread_b_prev = prev;
		}
	}
};

Arbiter.prototype.unthread = function()
{
	unthreadHelper(this, this.body_a, this.thread_a_prev, this.thread_a_next);
	unthreadHelper(this, this.body_b, this.thread_b_prev, this.thread_b_next);
	this.thread_a_prev = this.thread_a_next = null;
	this.thread_b_prev = this.thread_b_next = null;
};

//cpFloat
//cpContactsEstimateCrushingImpulse(cpContact *contacts, int numContacts)
//{
//	cpFloat fsum = 0;
//	cpVect vsum = vzero;
//	
//	for(int i=0; i<numContacts; i++){
//		cpContact *con = &contacts[i];
//		cpVect j = vrotate(con.n, v(con.jnAcc, con.jtAcc));
//		
//		fsum += vlength(j);
//		vsum = vadd(vsum, j);
//	}
//	
//	cpFloat vmag = vlength(vsum);
//	return (1 - vmag/fsum);
//}

Arbiter.prototype.update = function(contacts, handler, a, b)
{
	// Arbiters without contact data may exist if a collision function rejected the collision.
	if(this.contacts){
		// Iterate over the possible pairs to look for hash value matches.
		for(var i=0; i<this.contacts.length; i++){
			var old = this.contacts[i];
			
			for(var j=0; j<contacts.length; j++){
				var new_contact = contacts[j];
				
				// This could trigger false positives, but is fairly unlikely nor serious if it does.
				if(new_contact.hash === old.hash){
					// Copy the persistant contact information.
					new_contact.jnAcc = old.jnAcc;
					new_contact.jtAcc = old.jtAcc;
				}
			}
		}
	}
	
	this.contacts = contacts;
	
	this.handler = handler;
	this.swappedColl = (a.collision_type !== handler.a);
	
	this.e = a.e * b.e;
	this.u = a.u * b.u;
	this.surface_vr = vsub(a.surface_v, b.surface_v);
	
	// For collisions between two similar primitive types, the order could have been swapped.
	this.a = a; this.body_a = a.body;
	this.b = b; this.body_b = b.body;
	
	// mark it as new if it's been cached
	if(this.state == 'cached') this.state = 'first coll';
};

Arbiter.prototype.preStep = function(dt, slop, bias)
{
	var a = this.body_a;
	var b = this.body_b;
	
	for(var i=0; i<this.contacts.length; i++){
		var con = this.contacts[i];
		
		// Calculate the offsets.
		con.r1 = vsub(con.p, a.p);
		con.r2 = vsub(con.p, b.p);
		
		// Calculate the mass normal and mass tangent.
		con.nMass = 1/k_scalar(a, b, con.r1, con.r2, con.n);
		con.tMass = 1/k_scalar(a, b, con.r1, con.r2, vperp(con.n));
	
		// Calculate the target bias velocity.
		con.bias = -bias*min(0, con.dist + slop)/dt;
		con.jBias = 0;
		
		// Calculate the target bounce velocity.
		con.bounce = normal_relative_velocity(a, b, con.r1, con.r2, con.n)*this.e;
	}
};

Arbiter.prototype.applyCachedImpulse = function(dt_coef)
{
	if(this.isFirstContact()) return;
	
	var a = this.body_a;
	var b = this.body_b;
	
	for(var i=0; i<this.contacts.length; i++){
		var con = this.contacts[i];
		//var j = vrotate(con.n, new Vect(con.jnAcc, con.jtAcc));
		var nx = con.n.x;
		var ny = con.n.y;
		var jx = nx*con.jnAcc - ny*con.jtAcc;
		var jy = nx*con.jtAcc + ny*con.jnAcc;
		//apply_impulses(a, b, con.r1, con.r2, vmult(j, dt_coef));
		apply_impulses(a, b, con.r1, con.r2, jx * dt_coef, jy * dt_coef);
	}
};

// TODO is it worth splitting velocity/position correction?

Arbiter.prototype.applyImpulse = function()
{
	var a = this.body_a;
	var b = this.body_b;
	var surface_vr = this.surface_vr;
	var friction = this.u;

	for(var i=0; i<this.contacts.length; i++){
		var con = this.contacts[i];
		var nMass = con.nMass;
		var n = con.n;
		var r1 = con.r1;
		var r2 = con.r2;
		
		//var vr = relative_velocity(a, b, r1, r2);
		var vrx = b.v.x - r2.y * b.w - (a.v.x - r1.y * a.w);
		var vry = b.v.y + r2.x * b.w - (a.v.y + r1.x * a.w);
		
		//var vb1 = vadd(vmult(vperp(r1), a.w_bias), a.v_bias);
		var vb1x = (-r1.y) * a.w_bias + a.v_bias.x;
		var vb1y = ( r1.x) * a.w_bias + a.v_bias.y;

		//var vb2 = vadd(vmult(vperp(r2), b.w_bias), b.v_bias);
		var vb2x = (-r2.y) * b.w_bias + b.v_bias.x;
		var vb2y = ( r2.x) * b.w_bias + b.v_bias.y;
		
		//var vbn = vdot(vsub(vb2, vb1), n);
		var vbn = vdot2(vb2x-vb1x, vb2y-vb1y, n.x, n.y);
		var vrn = vdot2(vrx, vry, n.x, n.y);
		//var vrt = vdot(vadd(vr, surface_vr), vperp(n));
		var vrt = vdot2(vrx + surface_vr.x, vry + surface_vr.y, -n.y, n.x);
		
		var jbn = (con.bias - vbn)*nMass;
		var jbnOld = con.jBias;
		con.jBias = max(jbnOld + jbn, 0);
		
		var jn = -(con.bounce + vrn)*nMass;
		var jnOld = con.jnAcc;
		con.jnAcc = max(jnOld + jn, 0);
		
		var jtMax = friction*con.jnAcc;
		var jt = -vrt*con.tMass;
		var jtOld = con.jtAcc;
		con.jtAcc = clamp(jtOld + jt, -jtMax, jtMax);
		
		//apply_bias_impulses(a, b, r1, r2, vmult(n, con.jBias - jbnOld));
		var bias_x = n.x * (con.jBias - jbnOld);
		var bias_y = n.y * (con.jBias - jbnOld);
		apply_bias_impulse(a, -bias_x, -bias_y, r1);
		apply_bias_impulse(b, bias_x, bias_y, r2);

		//apply_impulses(a, b, r1, r2, vrotate(n, new Vect(con.jnAcc - jnOld, con.jtAcc - jtOld)));
		var rot_x = con.jnAcc - jnOld;
		var rot_y = con.jtAcc - jtOld;
		apply_impulses(a, b, r1, r2, n.x*rot_x - n.y*rot_y, n.x*rot_y + n.y*rot_x);

	}
};

Arbiter.prototype.callSeparate = function(space)
{
	// The handler needs to be looked up again as the handler cached on the arbiter may have been deleted since the last step.
	var handler = space.lookupHandler(this.a.collision_type, this.b.collision_type);
	handler.separate(this, space);
};

// From chipmunk_private.h
Arbiter.prototype.next = function(body)
{
	return (this.body_a == body ? this.thread_a_next : this.thread_b_next);
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// typedef int (*collisionFunc)(const cpShape *, const cpShape *, cpContact *);

var NONE = [];

// Add contact points for circle to circle collisions.
// Used by several collision tests.
var circle2circleQuery = function(p1, p2, r1, r2)
{
	var mindist = r1 + r2;
	var delta = vsub(p2, p1);
	var distsq = vlengthsq(delta);
	if(distsq >= mindist*mindist) return;
	
	var dist = Math.sqrt(distsq);

	// Allocate and initialize the contact.
	return new Contact(
		vadd(p1, vmult(delta, 0.5 + (r1 - 0.5*mindist)/(dist ? dist : Infinity))),
		(dist ? vmult(delta, 1/dist) : new Vect(1, 0)),
		dist - mindist,
		0
	);
};

// Collide circle shapes.
var circle2circle = function(circ1, circ2)
{
	var contact = circle2circleQuery(circ1.tc, circ2.tc, circ1.r, circ2.r);
	return contact ? [contact] : NONE;
};

var circle2segment = function(circleShape, segmentShape)
{
	var seg_a = segmentShape.ta;
	var seg_b = segmentShape.tb;
	var center = circleShape.tc;
	
	var seg_delta = vsub(seg_b, seg_a);
	var closest_t = clamp01(vdot(seg_delta, vsub(center, seg_a))/vlengthsq(seg_delta));
	var closest = vadd(seg_a, vmult(seg_delta, closest_t));
	
	var contact = circle2circleQuery(center, closest, circleShape.r, segmentShape.r);
	if(contact){
		var n = contact.n;
		
		// Reject endcap collisions if tangents are provided.
		return (
			(closest_t === 0 && vdot(n, segmentShape.a_tangent) < 0) ||
			(closest_t === 1 && vdot(n, segmentShape.b_tangent) < 0)
		) ? NONE : [contact];
	} else {
		return NONE;
	}
}

// Find the minimum separating axis for the given poly and axis list.
//
// This function needs to return two values - the index of the min. separating axis and
// the value itself. Short of inlining MSA, returning values through a global like this
// is the fastest implementation.
//
// See: http://jsperf.com/return-two-values-from-function/2
var last_MSA_min = 0;
var findMSA = function(poly, axes)
{
	var min_index = 0;
	var min = poly.valueOnAxis(axes[0].n, axes[0].d);
	if(min > 0) return -1;
	
	for(var i=1; i<axes.length; i++){
		var dist = poly.valueOnAxis(axes[i].n, axes[i].d);
		if(dist > 0) {
			return -1;
		} else if(dist > min){
			min = dist;
			min_index = i;
		}
	}
	
	last_MSA_min = min;
	return min_index;
};

// Add contacts for probably penetrating vertexes.
// This handles the degenerate case where an overlap was detected, but no vertexes fall inside
// the opposing polygon. (like a star of david)
var findVertsFallback = function(poly1, poly2, n, dist)
{
	var arr = [];

	for(var i=0; i<poly1.tVerts.length; i++){
		var v = poly1.tVerts[i];
		if(poly2.containsVertPartial(v, vneg(n))){
			arr.push(new Contact(v, n, dist, hashPair(poly1.hashid, i)));
		}
	}
	
	for(var i=0; i<poly2.tVerts.length; i++){
		var v = poly2.tVerts[i];
		if(poly1.containsVertPartial(v, n)){
			arr.push(new Contact(v, n, dist, hashPair(poly2.hashid, i)));
		}
	}
	
	return arr;
};

// Add contacts for penetrating vertexes.
var findVerts = function(poly1, poly2, n, dist)
{
	var arr = [];

	for(var i=0; i<poly1.tVerts.length; i++){
		var v = poly1.tVerts[i];
		if(poly2.containsVert(v)){
			arr.push(new Contact(v, n, dist, hashPair(poly1.hashid, i)));
		}
	}
	
	for(var i=0; i<poly2.tVerts.length; i++){
		var v = poly2.tVerts[i];
		if(poly1.containsVert(v)){
			arr.push(new Contact(v, n, dist, hashPair(poly2.hashid, i)));
		}
	}
	
	return (arr.length ? arr : findVertsFallback(poly1, poly2, n, dist));
};

// Collide poly shapes together.
var poly2poly = function(poly1, poly2)
{
	var mini1 = findMSA(poly2, poly1.tAxes);
	if(mini1 == -1) return 0;
	var min1 = last_MSA_min;
	
	var mini2 = findMSA(poly1, poly2.tAxes);
	if(mini2 == -1) return 0;
	var min2 = last_MSA_min;
	
	// There is overlap, find the penetrating verts
	if(min1 > min2)
		return findVerts(poly1, poly2, poly1.tAxes[mini1].n, min1);
	else
		return findVerts(poly1, poly2, vneg(poly2.tAxes[mini2].n), min2);
};

// Like cpPolyValueOnAxis(), but for segments.
var segValueOnAxis = function(seg, n, d)
{
	var a = vdot(n, seg.ta) - seg.r;
	var b = vdot(n, seg.tb) - seg.r;
	return min(a, b) - d;
};

// Identify vertexes that have penetrated the segment.
var findPointsBehindSeg = function(arr, seg, poly, pDist, coef) 
{
	var dta = vcross(seg.tn, seg.ta);
	var dtb = vcross(seg.tn, seg.tb);
	var n = vmult(seg.tn, coef);
	
	for(var i=0; i<poly.tVerts.length; i++){
		var v = poly.tVerts[i];
		if(vdot(v, n) < vdot(seg.tn, seg.ta)*coef + seg.r){
			var dt = vcross(seg.tn, v);
			if(dta >= dt && dt >= dtb){
				arr.push(new Contact(v, n, pDist, hashPair(poly.hashid, i)));
			}
		}
	}
};

// This one is complicated and gross. Just don't go there...
// TODO: Comment me!
var seg2poly = function(seg, poly)
{
	var arr = [];

	var axes = poly.tAxes;
	var numVerts = axes.length;
	
	var segD = vdot(seg.tn, seg.ta);
	var minNorm = poly.valueOnAxis(seg.tn, segD) - seg.r;
	var minNeg = poly.valueOnAxis(vneg(seg.tn), -segD) - seg.r;
	if(minNeg > 0 || minNorm > 0) return NONE;
	
	var mini = 0;
	var poly_min = segValueOnAxis(seg, axes[0].n, axes[0].d);
	if(poly_min > 0) return NONE;
	for(var i=0; i<numVerts; i++){
		var dist = segValueOnAxis(seg, axes[i].n, axes[i].d);
		if(dist > 0){
			return NONE;
		} else if(dist > poly_min){
			poly_min = dist;
			mini = i;
		}
	}
	
	var poly_n = vneg(axes[mini].n);
	
	var va = vadd(seg.ta, vmult(poly_n, seg.r));
	var vb = vadd(seg.tb, vmult(poly_n, seg.r));
	if(poly.containsVert(va))
		arr.push(new Contact(va, poly_n, poly_min, hashPair(seg.hashid, 0)));
	if(poly.containsVert(vb))
		arr.push(new Contact(vb, poly_n, poly_min, hashPair(seg.hashid, 1)));
	
	// Floating point precision problems here.
	// This will have to do for now.
//	poly_min -= cp_collision_slop; // TODO is this needed anymore?
	
	if(minNorm >= poly_min || minNeg >= poly_min) {
		if(minNorm > minNeg)
			findPointsBehindSeg(arr, seg, poly, minNorm, 1);
		else
			findPointsBehindSeg(arr, seg, poly, minNeg, -1);
	}
	
	// If no other collision points are found, try colliding endpoints.
	if(arr.length === 0){
		var poly_a = poly.tVerts[mini];
		var poly_b = poly.tVerts[(mini + 1)%numVerts];
		
		var con;
		if((con = circle2circleQuery(seg.ta, poly_a, seg.r, 0, arr))) return [con];
		if((con = circle2circleQuery(seg.tb, poly_a, seg.r, 0, arr))) return [con];
		if((con = circle2circleQuery(seg.ta, poly_b, seg.r, 0, arr))) return [con];
		if((con = circle2circleQuery(seg.tb, poly_b, seg.r, 0, arr))) return [con];
	}

	return arr;
};

// This one is less gross, but still gross.
// TODO: Comment me!
var circle2poly = function(circ, poly)
{
	var axes = poly.tAxes;
	
	var mini = 0;
	var min = vdot(axes[0].n, circ.tc) - axes[0].d - circ.r;
	for(var i=0; i<axes.length; i++){
		var dist = vdot(axes[i].n, circ.tc) - axes[i].d - circ.r;
		if(dist > 0){
			return NONE;
		} else if(dist > min) {
			min = dist;
			mini = i;
		}
	}
	
	var n = axes[mini].n;
	var a = poly.tVerts[mini];
	var b = poly.tVerts[(mini + 1)%poly.tVerts.length];
	var dta = vcross(n, a);
	var dtb = vcross(n, b);
	var dt = vcross(n, circ.tc);
		
	if(dt < dtb){
		var con = circle2circleQuery(circ.tc, b, circ.r, 0, con);
		return con ? [con] : NONE;
	} else if(dt < dta) {
		return [new Contact(
			vsub(circ.tc, vmult(n, circ.r + min/2)),
			vneg(n),
			min,
			0
		)];
	} else {
		var con = circle2circleQuery(circ.tc, a, circ.r, 0, con);
		return con ? [con] : NONE;
	}
};

// The javascripty way to do this would be either nested object or methods on the prototypes.
// 
// However, the *fastest* way is the method below.
// See: http://jsperf.com/dispatch

// These are copied from the prototypes into the actual objects in the Shape constructor.
CircleShape.prototype.collisionCode = 0;
SegmentShape.prototype.collisionCode = 1;
PolyShape.prototype.collisionCode = 2;

CircleShape.prototype.collisionTable = [
	circle2circle,
	circle2segment,
	circle2poly
];

SegmentShape.prototype.collisionTable = [
	null,
	function(seg, seg) { return NONE; }, // seg2seg
	seg2poly
];

PolyShape.prototype.collisionTable = [
	null,
	null,
	poly2poly
];

var collideShapes = exports.collideShapes = function(a, b)
{
	assert(a.collisionCode <= b.collisionCode, 'Collided shapes must be sorted by type');
	return a.collisionTable[b.collisionCode](a, b);
};
/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

var getShapeBB = function(shape){return shape.bb;};
var shapeVelocityFunc = function(shape){return shape.body.v;};

var defaultCollisionHandler = new CollisionHandler();

/// Basic Unit of Simulation in Chipmunk
var Space = exports.Space = function() {
	this.stamp = 0;
	this.curr_dt = 0;

	this.bodies = [];
	this.rousedBodies = [];
	this.sleepingComponents = [];
	
	this.staticShapes = new BBTree(getShapeBB, null);
	this.activeShapes = new BBTree(getShapeBB, this.staticShapes);
	this.activeShapes.velocityfunc = shapeVelocityFunc;
	
	this.arbiters = [];
	this.contactBuffersHead = null;
	this.cachedArbiters = {};
	//this.pooledArbiters = [];
	
	this.constraints = [];
	
	this.locked = 0;
	
	this.collisionHandlers = {};
	this.defaultHandler = defaultCollisionHandler;

	this.postStepCallbacks = [];
	
	/// Number of iterations to use in the impulse solver to solve contacts.
	this.iterations = 10;
	
	/// Gravity to pass to rigid bodies when integrating velocity.
	this.gravity = vzero;
	
	/// Damping rate expressed as the fraction of velocity bodies retain each second.
	/// A value of 0.9 would mean that each body's velocity will drop 10% per second.
	/// The default value is 1.0, meaning no damping is applied.
	/// @note This damping value is different than those of cpDampedSpring and cpDampedRotarySpring.
	this.damping = 1;
	
	/// Speed threshold for a body to be considered idle.
	/// The default value of 0 means to let the space guess a good threshold based on gravity.
	this.idleSpeedThreshold = 0;
	
	/// Time a group of bodies must remain idle in order to fall asleep.
	/// Enabling sleeping also implicitly enables the the contact graph.
	/// The default value of Infinity disables the sleeping algorithm.
	this.sleepTimeThreshold = Infinity;
	
	/// Amount of encouraged penetration between colliding shapes..
	/// Used to reduce oscillating contacts and keep the collision cache warm.
	/// Defaults to 0.1. If you have poor simulation quality,
	/// increase this number as much as possible without allowing visible amounts of overlap.
	this.collisionSlop = 0.1;
	
	/// Determines how fast overlapping shapes are pushed apart.
	/// Expressed as a fraction of the error remaining after each second.
	/// Defaults to pow(1.0 - 0.1, 60.0) meaning that Chipmunk fixes 10% of overlap each frame at 60Hz.
	this.collisionBias = Math.pow(1 - 0.1, 60);
	
	/// Number of frames that contact information should persist.
	/// Defaults to 3. There is probably never a reason to change this value.
	this.collisionPersistence = 3;
	
	/// Rebuild the contact graph during each step. Must be enabled to use the cpBodyEachArbiter() function.
	/// Disabled by default for a small performance boost. Enabled implicitly when the sleeping feature is enabled.
	this.enableContactGraph = false;
	
	/// The designated static body for this space.
	/// You can modify this body, or replace it with your own static body.
	/// By default it points to a statically allocated cpBody in the cpSpace struct.
	this.staticBody = new Body(Infinity, Infinity);
	this.staticBody.nodeIdleTime = Infinity;

	// Cache the collideShapes callback function for the space.
	this.collideShapes = this.makeCollideShapes();
};

/// returns true from inside a callback and objects cannot be added/removed.
Space.prototype.isLocked = function()
{
	return this.locked;
};

var assertSpaceUnlocked = function(space)
{
	assert(!space.locked, "This addition/removal cannot be done safely during a call to cpSpaceStep() \
 or during a query. Put these calls into a post-step callback.");
};

// **** Collision handler function management

/// Set a collision handler to be used whenever the two shapes with the given collision types collide.
/// You can pass null for any function you don't want to implement.
Space.prototype.addCollisionHandler = function(a, b, begin, preSolve, postSolve, separate)
{
	assertSpaceUnlocked(this);
		
	// Remove any old function so the new one will get added.
	this.removeCollisionHandler(a, b);
	
	var handler = new CollisionHandler();
	handler.a = a;
	handler.b = b;
	if(begin) handler.begin = begin;
	if(preSolve) handler.preSolve = preSolve;
	if(postSolve) handler.postSolve = postSolve;
	if(separate) handler.separate = separate;

	this.collisionHandlers[hashPair(a, b)] = handler;
};

/// Unset a collision handler.
Space.prototype.removeCollisionHandler = function(a, b)
{
	assertSpaceUnlocked(this);
	
	delete this.collisionHandlers[hashPair(a, b)];
};

/// Set a default collision handler for this space.
/// The default collision handler is invoked for each colliding pair of shapes
/// that isn't explicitly handled by a specific collision handler.
/// You can pass null for any function you don't want to implement.
Space.prototype.setDefaultCollisionHandler = function(begin, preSolve, postSolve, separate)
{
	assertSpaceUnlocked(this);

	var handler = new CollisionHandler();
	if(begin) handler.begin = begin;
	if(preSolve) handler.preSolve = preSolve;
	if(postSolve) handler.postSolve = postSolve;
	if(separate) handler.separate = separate;

	this.defaultHandler = handler;
};

Space.prototype.lookupHandler = function(a, b)
{
	return this.collisionHandlers[hashPair(a, b)] || this.defaultHandler;
};

// **** Body, Shape, and Joint Management

/// Add a collision shape to the simulation.
/// If the shape is attached to a static body, it will be added as a static shape.
Space.prototype.addShape = function(shape)
{
	var body = shape.body;
	if(body.isStatic()) return this.addStaticShape(shape);
	
	// TODO change these to check if it was added to a space at all.
	assert(!shape.space, "This shape is already added to a space and cannot be added to another.");
	assertSpaceUnlocked(this);
	
	body.activate();
	body.addShape(shape);
	
	shape.update(body.p, body.rot);
	this.activeShapes.insert(shape, shape.hashid);
	shape.space = this;
		
	return shape;
};

/// Explicity add a shape as a static shape to the simulation.
Space.prototype.addStaticShape = function(shape)
{
	assert(!shape.space, "This shape is already added to a space and cannot be added to another.");
	assertSpaceUnlocked(this);
	
	var body = shape.body;
	body.addShape(shape);

	shape.update(body.p, body.rot);
	this.staticShapes.insert(shape, shape.hashid);
	shape.space = this;
	
	return shape;
};

/// Add a rigid body to the simulation.
Space.prototype.addBody = function(body)
{
	assert(!body.isStatic(), "Static bodies cannot be added to a space as they are not meant to be simulated.");
	assert(!body.space, "This body is already added to a space and cannot be added to another.");
	assertSpaceUnlocked(this);
	
	this.bodies.push(body);
	body.space = this;
	
	return body;
};

/// Add a constraint to the simulation.
Space.prototype.addConstraint = function(constraint)
{
	assert(!constraint.space, "This shape is already added to a space and cannot be added to another.");
	assertSpaceUnlocked(this);
	
	var a = constraint.a, b = constraint.b;

	a.activate();
	b.activate();
	this.constraints.push(constraint);
	
	// Push onto the heads of the bodies' constraint lists
	constraint.next_a = a.constraintList; a.constraintList = constraint;
	constraint.next_b = b.constraintList; b.constraintList = constraint;
	constraint.space = this;
	
	return constraint;
};

Space.prototype.filterArbiters = function(body, filter)
{
	for (var hash in this.cachedArbiters)
	{
		var arb = this.cachedArbiters[hash];

		// Match on the filter shape, or if it's null the filter body
		if(
			(body === arb.body_a && (filter === arb.a || filter === null)) ||
			(body === arb.body_b && (filter === arb.b || filter === null))
		){
			// Call separate when removing shapes.
			if(filter && arb.state !== 'cached') arb.callSeparate(this);
			
			arb.unthread();

			deleteObjFromList(this.arbiters, arb);
			//this.pooledArbiters.push(arb);
			
			delete this.cachedArbiters[hash];
		}
	}
};

/// Remove a collision shape from the simulation.
Space.prototype.removeShape = function(shape)
{
	var body = shape.body;
	if(body.isStatic()){
		this.removeStaticShape(shape);
	} else {
		assert(this.containsShape(shape),
			"Cannot remove a shape that was not added to the space. (Removed twice maybe?)");
		assertSpaceUnlocked(this);
		
		body.activate();
		body.removeShape(shape);
		this.filterArbiters(body, shape);
		this.activeShapes.remove(shape, shape.hashid);
		shape.space = null;
	}
};

/// Remove a collision shape added using addStaticShape() from the simulation.
Space.prototype.removeStaticShape = function(shape)
{
	assert(this.containsShape(shape),
		"Cannot remove a static or sleeping shape that was not added to the space. (Removed twice maybe?)");
	assertSpaceUnlocked(this);
	
	var body = shape.body;
	if(body.isStatic()) body.activateStatic(shape);
	body.removeShape(shape);
	this.filterArbiters(body, shape);
	this.staticShapes.remove(shape, shape.hashid);
	shape.space = null;
};

/// Remove a rigid body from the simulation.
Space.prototype.removeBody = function(body)
{
	assert(this.containsBody(body),
		"Cannot remove a body that was not added to the space. (Removed twice maybe?)");
	assertSpaceUnlocked(this);
	
	body.activate();
//	this.filterArbiters(body, null);
	deleteObjFromList(this.bodies, body);
	body.space = null;
};

/// Remove a constraint from the simulation.
Space.prototype.removeConstraint = function(constraint)
{
	assert(space.containsConstraint(constraint),
		"Cannot remove a constraint that was not added to the space. (Removed twice maybe?)");
	assertSpaceUnlocked(this);
	
	constraint.a.activate();
	constraint.b.activate();
	deleteObjFromList(this.constraints, constraint);
	
	constraint.a.removeConstraint(constraint);
	constraint.b.removeConstraint(constraint);
	constraint.space = null;
};

/// Test if a collision shape has been added to the space.
Space.prototype.containsShape = function(shape)
{
	return (shape.space === this);
};

/// Test if a rigid body has been added to the space.
Space.prototype.containsBody = function(body)
{
	return (body.space == this);
};

/// Test if a constraint has been added to the space.
Space.prototype.containsConstraint = function(constraint)
{
	return (constraint.space == this);
};

Space.prototype.uncacheArbiter = function(arb)
{
	delete this.cachedArbiters[hashPair(arb.a.hashid, arb.b.hashid)];
	deleteObjFromList(this.arbiters, arb);
};


// **** Iteration

/// Call @c func for each body in the space.
Space.prototype.eachBody = function(func)
{
	this.lock(); {
		var bodies = this.bodies;
		
		for(var i=0; i<bodies.length; i++){
			func(bodies[i]);
		}
		
		// TODO BUG not safe to activate sleeping bodies from here!
		var components = this.sleepingComponents;
		for(var i=0; i<components.length; i++){
			var root = components[i];
			
			var body = root;
			while(body){
				var next = body.nodeNext;
				func(body);
				body = next;
			}
		}
	} this.unlock(true);
};

/// Call @c func for each shape in the space.
Space.prototype.eachShape = function(func)
{
	this.lock(); {
		this.activeShapes.each(func);
		this.staticShapes.each(func);
	} this.unlock(true);
};

/// Call @c func for each shape in the space.
Space.prototype.eachConstraint = function(func)
{
	this.lock(); {
		var constraints = this.constraints;
		
		for(var i=0; i<constraints.length; i++){
			func(constraints[i]);
		}
	} this.unlock(true);
};

// **** Spatial Index Management

/// Update the collision detection info for the static shapes in the space.
Space.prototype.reindexStatic = function()
{
	assert(!this.locked, "You cannot manually reindex objects while the space is locked. Wait until the current query or step is complete.");
	
	this.staticShapes.each(function(shape){
		var body = shape.body;
		shape.update(body.p, body.rot);
	});
	this.staticShapes.reindex();
};

/// Update the collision detection data for a specific shape in the space.
Space.prototype.reindexShape = function(shape)
{
	assert(!this.locked, "You cannot manually reindex objects while the space is locked. Wait until the current query or step is complete.");
	
	var body = shape.body;
	shape.update(body.p, body.rot);
	
	// attempt to rehash the shape in both hashes
	this.activeShapes.reindexObject(shape, shape.hashid);
	this.staticShapes.reindexObject(shape, shape.hashid);
};

/// Update the collision detection data for all shapes attached to a body.
Space.prototype.reindexShapesForBody = function(body)
{
	for(var shape = body.shapeList; shape; shape = shape.next){
		this.reindexShape(shape);
	}
};

/// Switch the space to use a spatial has as it's spatial index.
Space.prototype.useSpatialHash = function(dim, count)
{
	throw new Error('Spatial Hash not yet implemented!');
	
	var staticShapes = new SpaceHash(dim, count, getShapeBB, null);
	var activeShapes = new SpaceHash(dim, count, getShapeBB, staticShapes);
	
	this.staticShapes.each(function(shape){
		staticShapes.insert(shape, shape.hashid);
	});
	this.activeShapes.each(function(shape){
		activeShapes.insert(shape, shape.hashid);
	});
		
	this.staticShapes = staticShapes;
	this.activeShapes = activeShapes;
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
 
/// **** Sleeping Functions

Space.prototype.activateBody = function(body)
{
	assert(!body.isRogue(), "Internal error: Attempting to activate a rogue body.");
	
	if(this.locked){
		// cpSpaceActivateBody() is called again once the space is unlocked
		if(this.rousedBodies.indexOf(body) === -1) this.rousedBodies.push(body);
	} else {
		this.bodies.push(body);

		for(var i = 0; i < body.shapeList.length; i++){
			var shape = body.shapeList[i];
			this.staticShapes.remove(shape, shape.hashid);
			this.activeShapes.insert(shape, shape.hashid);
		}
		
		for(var arb = body.arbiterList; arb; arb = arb.next(body)){
			var bodyA = arb.body_a;
			if(body === bodyA || bodyA.isStatic()){
				//var contacts = arb.contacts;
				
				// Restore contact values back to the space's contact buffer memory
				//arb.contacts = cpContactBufferGetArray(this);
				//memcpy(arb.contacts, contacts, numContacts*sizeof(cpContact));
				//cpSpacePushContacts(this, numContacts);
				
				// Reinsert the arbiter into the arbiter cache
				var a = arb.a, b = arb.b;
				this.cachedArbiters[hashPair(a.hashid, b.hashid)] = arb;
				
				// Update the arbiter's state
				arb.stamp = this.stamp;
				arb.handler = this.lookupHandler(a.collision_type, b.collision_type);
				this.arbiters.push(arb);
			}
		}
		
		for(var constraint = body.constraintList; constraint; constraint = constraint.nodeNext){
			var bodyA = constraint.a;
			if(body === bodyA || bodyA.isStatic()) this.constraints.push(constraint);
		}
	}
};

Space.prototype.deactivateBody = function(body)
{
	assert(!body.isRogue(), "Internal error: Attempting to deactivate a rogue body.");
	
	deleteObjFromList(this.bodies, body);
	
	for(var i = 0; i < body.shapeList.length; i++){
		var shape = body.shapeList[i];
		this.activeShapes.remove(shape, shape.hashid);
		this.staticShapes.insert(shape, shape.hashid);
	}
	
	for(var arb = body.arbiterList; arb; arb = arb.next(body)){
		var bodyA = arb.body_a;
		if(body === bodyA || bodyA.isStatic()){
			this.uncacheArbiter(arb);
			
			// Save contact values to a new block of memory so they won't time out
			//size_t bytes = arb.numContacts*sizeof(cpContact);
			//cpContact *contacts = (cpContact *)cpcalloc(1, bytes);
			//memcpy(contacts, arb.contacts, bytes);
			//arb.contacts = contacts;
		}
	}
		
	for(var constraint = body.constraintList; constraint; constraint = constraint.nodeNext){
		var bodyA = constraint.a;
		if(body === bodyA || bodyA.isStatic()) deleteObjFromList(this.constraints, constraint);
	}
};

var componentRoot = function(body)
{
	return (body ? body.nodeRoot : null);
};

var componentActivate = function(root)
{
	if(!root || !root.isSleeping(root)) return;
	assert(!root.isRogue(), "Internal Error: componentActivate() called on a rogue body.");
	
	var space = root.space;
	var body = root;
	while(body){
		var next = body.nodeNext;
		
		body.nodeIdleTime = 0;
		body.nodeRoot = null;
		body.nodeNext = null;
		space.activateBody(body);
		
		body = next;
	}
	
	deleteObjFromList(space.sleepingComponents, root);
};

Body.prototype.activate = function()
{
	if(!this.isRogue()){
		this.nodeIdleTime = 0;
		componentActivate(componentRoot(this));
	}
};

Body.prototype.activateStatic = function(filter)
{
	assert(body.isStatic(this), "Body.activateStatic() called on a non-static body.");
	
	for(var arb = this.arbiterList; arb; arb = arb.next(this)){
		if(!filter || filter == arb.a || filter == arb.b){
			(arb.body_a == this ? arb.body_b : arb.body_a).activate();
		}
	}
	
	// TODO should also activate joints!
};

Body.prototype.pushArbiter = function(arb)
{
	assertSoft((arb.body_a === this ? arb.thread_a_next : arb.thread_b_next) === null,
		"Internal Error: Dangling contact graph pointers detected. (A)");
	assertSoft((arb.body_a === this ? arb.thread_a_prev : arb.thread_b_prev) === null,
		"Internal Error: Dangling contact graph pointers detected. (B)");
	
	var next = this.arbiterList;
	assertSoft(next === null || (next.body_a === this ? next.thread_a_prev : next.thread_b_prev) === null,
		"Internal Error: Dangling contact graph pointers detected. (C)");

	if(next){
		if(arb.body_a === this){
			arb.thread_a_next = next;
		} else {
			arb.thread_b_next = next;
		}
	
		if (next.body_a === this){
			next.thread_a_prev = arb;
		} else {
			next.thread_b_prev = arb;
		}
	}
	this.arbiterList = arb;
};

var componentAdd = function(root, body){
	body.nodeRoot = root;

	if(body !== root){
		body.nodeNext = root.nodeNext;
		root.nodeNext = body;
	}
};

var floodFillComponent = function(root, body)
{
	// Rogue bodies cannot be put to sleep and prevent bodies they are touching from sleeping anyway.
	// Static bodies (which are a type of rogue body) are effectively sleeping all the time.
	if(!body.isRogue()){
		var other_root = componentRoot(body);
		if(other_root == null){
			componentAdd(root, body);
			for(var arb = body.arbiterList; arb; arb = arb.next(body)){
				floodFillComponent(root, (body == arb.body_a ? arb.body_b : arb.body_a));
			}
			for(var constraint = body.constraintList; constraint; constraint = constraint.nodeNext){
				floodFillComponent(root, (body == constraint.a ? constraint.b : constraint.a));
			}
		} else {
			assertSoft(other_root === root, "Internal Error: Inconsistency detected in the contact graph.");
		}
	}
};

var componentActive = function(root, threshold)
{
	for(var body = root; body; body = body.nodeNext){
		if(body.nodeIdleTime < threshold) return true;
	}
	
	return false;
};

Space.prototype.processComponents = function(dt)
{
	var dv = this.idleSpeedThreshold;
	var dvsq = (dv ? dv*dv : vlengthsq(this.gravity)*dt*dt);
	
	// update idling and reset component nodes
	var bodies = this.bodies;
	for(var i=0; i<bodies.length; i++){
		var body = bodies[i];
		
		// Need to deal with infinite mass objects
		var keThreshold = (dvsq ? body.m*dvsq : 0);
		body.nodeIdleTime = (body.kineticEnergy() > keThreshold ? 0 : body.nodeIdleTime + dt);
		
		assertSoft(body.nodeNext === null, "Internal Error: Dangling next pointer detected in contact graph.");
		assertSoft(body.nodeRoot === null, "Internal Error: Dangling root pointer detected in contact graph.");
	}
	
	// Awaken any sleeping bodies found and then push arbiters to the bodies' lists.
	var arbiters = this.arbiters;
	for(var i=0, count=arbiters.length; i<count; i++){
		var arb = arbiters[i];
		var a = arb.body_a, b = arb.body_b;
		
		if((b.isRogue() && !b.isStatic()) || a.isSleeping()) a.activate();
		if((a.isRogue() && !a.isStatic()) || b.isSleeping()) b.activate();
		
		a.pushArbiter(arb);
		b.pushArbiter(arb);
	}
	
	// Bodies should be held active if connected by a joint to a non-static rouge body.
	var constraints = this.constraints;
	for(var i=0; i<constraints.length; i++){
		var constraint = constraints[i];
		var a = constraint.a, b = constraint.b;
		
		if(b.isRogue() && !b.isStatic()) a.activate();
		if(a.isRogue() && !a.isStatic()) b.activate();
	}
	
	// Generate components and deactivate sleeping ones
	for(var i=0; i<bodies.length;){
		var body = bodies[i];
		
		if(componentRoot(body) === null){
			// Body not in a component yet. Perform a DFS to flood fill mark 
			// the component in the contact graph using this body as the root.
			floodFillComponent(body, body);
			
			// Check if the component should be put to sleep.
			if(!componentActive(body, this.sleepTimeThreshold)){
				this.sleepingComponents.push(body);
				for(var other = body; other; other = other.nodeNext){
					this.deactivateBody(other);
				}
				
				// cpSpaceDeactivateBody() removed the current body from the list.
				// Skip incrementing the index counter.
				continue;
			}
		}
		
		i++;
		
		// Only sleeping bodies retain their component node pointers.
		body.nodeRoot = null;
		body.nodeNext = null;
	}
};

Body.prototype.sleep = function()
{
	this.sleepWithGroup(null);
};

Body.prototype.sleepWithGroup = function(group){
	assert(!this.isStatic() && !this.isRogue(), "Rogue and static bodies cannot be put to sleep.");
	
	var space = this.space;
	assert(space, "Cannot put a rogue body to sleep.");
	assert(!space.locked, "Bodies cannot be put to sleep during a query or a call to cpSpaceStep(). Put these calls into a post-step callback.");
	assert(group === null || group.isSleeping(), "Cannot use a non-sleeping body as a group identifier.");
	
	if(this.isSleeping()){
		assert(componentRoot(this) === componentRoot(group), "The body is already sleeping and it's group cannot be reassigned.");
		return;
	}
	
	for(var i = 0; i < body.shapeList.length; i++){
		body.shapeList.update(this.p, this.rot);
	}
	space.deactivateBody(this);
	
	if(group){
		var root = componentRoot(group);
		
		this.nodeRoot = root;
		this.nodeNext = root.nodeNext;
		this.nodeIdleTime = 0;
		
		root.nodeNext = this;
	} else {
		this.nodeRoot = this;
		this.nodeNext = null;
		this.nodeIdleTime = 0;
		
		space.sleepingComponents.push(this);
	}
	
	deleteObjFromList(space.bodies, this);
};

Space.prototype.activateShapesTouchingShape = function(shape){
	if(this.sleepTimeThreshold !== Infinity){
		this.shapeQuery(shape, function(shape, points) {
			shape.body.activate();
		});
	}
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// Query the space at a point and call @c func for each shape found.
Space.prototype.pointQuery = function(point, layers, group, func)
{
	var helper = function(shape){
		if(
			!(shape.group && group === shape.group) && (layers & shape.layers) &&
			shape.pointQuery(point)
		){
			func(shape);
		}
	};

	this.lock(); {
		this.activeShapes.pointQuery(point, helper);
		this.staticShapes.pointQuery(point, helper);
	} this.unlock(true);
};

/// Query the space at a point and return the first shape found. Returns null if no shapes were found.
Space.prototype.pointQueryFirst = function(point, layers, group)
{
	var outShape = null;
	this.pointQuery(point, layers, group, function(shape) {
		if(!shape.sensor) outShape = shape;
	});
	
	return outShape;
};

/// Perform a directed line segment query (like a raycast) against the space calling @c func for each shape intersected.
Space.prototype.segmentQuery = function(start, end, layers, group, func)
{
	var helper = function(shape){
		var info;
		
		if(
			!(shape.group && group === shape.group) && (layers & shape.layers) &&
			(info = shape.segmentQuery(start, end))
		){
			func(shape, info.t, info.n);
		}
		
		return 1;
	};

	this.lock(); {
		this.staticShapes.segmentQuery(start, end, 1, helper);
		this.activeShapes.segmentQuery(start, end, 1, helper);
	} this.unlock(true);
};

/// Perform a directed line segment query (like a raycast) against the space and return the first shape hit. Returns null if no shapes were hit.
Space.prototype.segmentQueryFirst = function(start, end, layers, group)
{
	var out = null;

	var helper = function(shape){
		var info;
		
		if(
			!(shape.group && group === shape.group) && (layers & shape.layers) &&
			!shape.sensor &&
			(info = shape.segmentQuery(start, end)) &&
			info.t < out.t
		){
			out = info;
		}
		
		return out.t;
	};

	this.staticShapes.segmentQuery(start, end, 1, helper);
	this.activeShapes.segmentQuery(start, end, out.t, helper);
	
	return out;
};

/// Perform a fast rectangle query on the space calling @c func for each shape found.
/// Only the shape's bounding boxes are checked for overlap, not their full shape.
Space.prototype.bbQuery = function(bb, layers, group, func)
{
	var helper = function(shape){
		if(
			!(shape.group && group === shape.group) && (layers & shape.layers) &&
			bbIntersects(bb, shape.bb)
		){
			func(shape);
		}
	};
	
	this.lock(); {
		this.activeShapes.query(bb, helper);
		this.staticShapes.query(bb, helper);
	} this.unlock(true);
};

/// Query a space for any shapes overlapping the given shape and call @c func for each shape found.
Space.prototype.shapeQuery = function(shape, func)
{
	var body = shape.body;
	var bb = (body ? shape.update(body.p, body.rot) : shape.bb);

	//shapeQueryContext context = {func, data, false};
	var anyCollision = false;
	
	var helper = function(b){
		var a = shape;
		// Reject any of the simple cases
		if(
			(a.group && a.group === b.group) ||
			!(a.layers & b.layers) ||
			a === b
		) return;
		
		var contacts;
		
		// Shape 'a' should have the lower shape type. (required by cpCollideShapes() )
		if(a.collisionCode <= b.collisionCode){
			contacts = cpCollideShapes(a, b);
		} else {
			contacts = cpCollideShapes(b, a);
			for(var i=0; i<contacts.length; i++) contacts[i].n = vneg(contacts[i].n);
		}
		
		if(contacts.length){
			anyCollision = !(a.sensor || b.sensor);
			
			if(func){
				var set = new Array(contacts.length);
				for(var i=0; i<contacts.length; i++){
					set[i] = new ContactPoint(contacts[i].p, contacts[i].n, contacts[i].dist);
				}
				
				func(b, set);
			}
		}
	};

	this.lock(); {
		this.activeShapes.query(bb, helper);
		this.staticShapes.query(bb, helper);
	} this.unlock(true);
	
	return anyCollision;
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
 
// **** Post Step Callback Functions

/// Schedule a post-step callback to be called when cpSpaceStep() finishes.
Space.prototype.addPostStepCallback = function(func)
{
	assertWarn(this.locked,
		"Adding a post-step callback when the space is not locked is unnecessary. " +
		"Post-step callbacks will not called until the end of the next call to cpSpaceStep() or the next query.");
	
	this.postStepCallbacks.push(func);
};

Space.prototype.runPostStepCallbacks = function()
{
	// Don't cache length because post step callbacks may add more post step callbacks
	// directly or indirectly.
	for(var i = 0; i < this.postStepCallbacks.length; i++){
		this.postStepCallbacks[i]();
	}
};

// **** Locking Functions

Space.prototype.lock = function()
{
	this.locked++;
};

Space.prototype.unlock = function(runPostStep)
{
	this.locked--;
	assert(this.locked >= 0, "Internal Error: Space lock underflow.");
	
	if(!this.locked && runPostStep){
		var waking = this.rousedBodies;
		for(var i=0; i<waking.length; i++){
			this.activateBody(waking[i]);
		}
		
		waking.length = 0;
		
		this.runPostStepCallbacks();
	}
};

// **** Contact Buffer Functions

/* josephg:
 *
 * This code might be faster in JS than just allocating objects each time - I'm
 * really not sure. If the contact buffer solution is used, there will also
 * need to be changes in cpCollision.js to fill a passed array instead of creating
 * new arrays each time.
 *
 * TODO: Benchmark me once chipmunk is working.
 */

/*
var ContactBuffer = function(stamp, splice)
{
	this.stamp = stamp;
	// Contact buffers are a circular linked list.
	this.next = splice ? splice.next : this;
	this.contacts = [];
};

Space.prototype.pushFreshContactBuffer = function()
{
	var stamp = this.stamp;
	
	var head = this.contactBuffersHead;
	
	if(!head){
		// No buffers have been allocated, make one
		this.contactBuffersHead = new ContactBuffer(stamp, null);
	} else if(stamp - head.next.stamp > this.collisionPersistence){
		// The tail buffer is available, rotate the ring
		var tail = head.next;
		tail.stamp = stamp;
		tail.contacts.length = 0;
		this.contactBuffersHead = tail;
	} else {
		// Allocate a new buffer and push it into the ring
		var buffer = new ContactBuffer(stamp, head);
		this.contactBuffersHead = head.next = buffer;
	}
};

cpContact *
cpContactBufferGetArray(cpSpace *space)
{
	if(space.contactBuffersHead.numContacts + CP_MAX_CONTACTS_PER_ARBITER > CP_CONTACTS_BUFFER_SIZE){
		// contact buffer could overflow on the next collision, push a fresh one.
		space.pushFreshContactBuffer();
	}
	
	cpContactBufferHeader *head = space.contactBuffersHead;
	return ((cpContactBuffer *)head)->contacts + head.numContacts;
}

void
cpSpacePushContacts(cpSpace *space, int count)
{
	cpAssertHard(count <= CP_MAX_CONTACTS_PER_ARBITER, "Internal Error: Contact buffer overflow!");
	space.contactBuffersHead.numContacts += count;
}

static void
cpSpacePopContacts(cpSpace *space, int count){
	space.contactBuffersHead.numContacts -= count;
}
*/

// **** Collision Detection Functions

/* Use this to re-enable object pools.
static void *
cpSpaceArbiterSetTrans(cpShape **shapes, cpSpace *space)
{
	if(space.pooledArbiters.num == 0){
		// arbiter pool is exhausted, make more
		int count = CP_BUFFER_BYTES/sizeof(cpArbiter);
		cpAssertHard(count, "Internal Error: Buffer size too small.");
		
		cpArbiter *buffer = (cpArbiter *)cpcalloc(1, CP_BUFFER_BYTES);
		cpArrayPush(space.allocatedBuffers, buffer);
		
		for(int i=0; i<count; i++) cpArrayPush(space.pooledArbiters, buffer + i);
	}
	
	return cpArbiterInit((cpArbiter *)cpArrayPop(space.pooledArbiters), shapes[0], shapes[1]);
}*/

// Callback from the spatial hash.
Space.prototype.makeCollideShapes = function()
{
	// It would be nicer to use .bind() or something, but this is faster.
	var space_ = this;
	return function(a, b){
		var space = space_;

		// Reject any of the simple cases
		if(
			// BBoxes must overlap
			!bbIntersects(a.bb, b.bb)
			// Don't collide shapes attached to the same body.
			|| a.body === b.body
			// Don't collide objects in the same non-zero group
			|| (a.group && a.group === b.group)
			// Don't collide objects that don't share at least on layer.
			|| !(a.layers & b.layers)
		) return;
		
		var handler = space.lookupHandler(a.collision_type, b.collision_type);
		
		var sensor = a.sensor || b.sensor;
		if(sensor && handler === defaultCollisionHandler) return;
		
		// Shape 'a' should have the lower shape type. (required by cpCollideShapes() )
		if(a.collisionCode > b.collisionCode){
			var temp = a;
			a = b;
			b = temp;
		}
		
		// Narrow-phase collision detection.
		//cpContact *contacts = cpContactBufferGetArray(space);
		//int numContacts = cpCollideShapes(a, b, contacts);
		var contacts = collideShapes(a, b);
		if(contacts.length === 0) return; // Shapes are not colliding.
		//cpSpacePushContacts(space, numContacts);
		
		// Get an arbiter from space.arbiterSet for the two shapes.
		// This is where the persistant contact magic comes from.
		var arbHash = hashPair(a.hashid, b.hashid);
		var arb = space.cachedArbiters[arbHash];
		if (!arb){
			arb = space.cachedArbiters[arbHash] = new Arbiter(a, b);
		}

		arb.update(contacts, handler, a, b);
		
		// Call the begin function first if it's the first step
		if(arb.state == 'first coll' && !handler.begin(arb, space)){
			arb.ignore(); // permanently ignore the collision until separation
		}
		
		if(
			// Ignore the arbiter if it has been flagged
			(arb.state !== 'ignore') && 
			// Call preSolve
			handler.preSolve(arb, space) &&
			// Process, but don't add collisions for sensors.
			!sensor
		){
			space.arbiters.push(arb);
		} else {
			//cpSpacePopContacts(space, numContacts);
			
			arb.contacts = null;
			
			// Normally arbiters are set as used after calling the post-solve callback.
			// However, post-solve callbacks are not called for sensors or arbiters rejected from pre-solve.
			if(arb.state !== 'ignore') arb.state = 'normal';
		}
		
		// Time stamp the arbiter so we know it was used recently.
		arb.stamp = space.stamp;
	};
};

// Hashset filter func to throw away old arbiters.
Space.prototype.arbiterSetFilter = function(arb)
{
	var ticks = this.stamp - arb.stamp;
	
	var a = arb.body_a, b = arb.body_b;
	
	// TODO should make an arbiter state for this so it doesn't require filtering arbiters for
	// dangling body pointers on body removal.
	// Preserve arbiters on sensors and rejected arbiters for sleeping objects.
	if(
		(a.isStatic() || a.isSleeping()) &&
		(b.isStatic() || b.isSleeping())
	){
		return true;
	}
	
	// Arbiter was used last frame, but not this one
	if(ticks >= 1 && arb.state != 'cached'){
		arb.callSeparate(this);
		arb.state = 'cached';
	}
	
	if(ticks >= this.collisionPersistence){
		arb.contacts = null;
		
		//cpArrayPush(this.pooledArbiters, arb);
		return false;
	}
	
	return true;
};

// **** All Important cpSpaceStep() Function

var updateFunc = function(shape)
{
	var body = shape.body;
	shape.update(body.p, body.rot);
};

/// Step the space forward in time by @c dt.
Space.prototype.step = function(dt)
{
	// don't step if the timestep is 0!
	if(dt === 0) return;

	assert(vzero.x === 0 && vzero.y === 0, "vzero is invalid");
	
	this.stamp++;
	
	var prev_dt = this.curr_dt;
	this.curr_dt = dt;
		
	var bodies = this.bodies;
	var constraints = this.constraints;
	var arbiters = this.arbiters;
	
	// Reset and empty the arbiter list.
	for(var i=0; i<arbiters.length; i++){
		var arb = arbiters[i];
		arb.state = 'normal';
		
		// If both bodies are awake, unthread the arbiter from the contact graph.
		if(!arb.body_a.isSleeping() && !arb.body_b.isSleeping()){
			arb.unthread();
		}
	}
	arbiters.length = 0;

	this.lock(); {
		// Integrate positions
		for(var i=0; i<bodies.length; i++){
			var body = bodies[i];
			body.position_func(dt);
		}
		
		// Find colliding pairs.
		//this.pushFreshContactBuffer();
		this.activeShapes.each(updateFunc);
		this.activeShapes.reindexQuery(this.collideShapes);
	} this.unlock(false);
	
	// If body sleeping is enabled, do that now.
	if(this.sleepTimeThreshold != Infinity || this.enableContactGraph){
		this.processComponents(dt);
	}
	
	this.lock(); {
		// Clear out old cached arbiters and call separate callbacks
		for(var hash in this.cachedArbiters) {
			if(!this.arbiterSetFilter(this.cachedArbiters[hash])) {
				delete this.cachedArbiters[hash];
			}
		}

		// Prestep the arbiters and constraints.
		var slop = this.collisionSlop;
		var biasCoef = 1 - Math.pow(this.collisionBias, dt);
		for(var i=0; i<arbiters.length; i++){
			arbiters[i].preStep(dt, slop, biasCoef);
		}

		for(var i=0; i<constraints.length; i++){
			var constraint = constraints[i];
			
			constraint.preSolve(this);
			constraint.preStep(dt);
		}
	
		// Integrate velocities.
		var damping = Math.pow(this.damping, dt);
		var gravity = this.gravity;
		for(var i=0; i<bodies.length; i++){
			var body = bodies[i];
			body.velocity_func(gravity, damping, dt);
		}
		
		// Apply cached impulses
		var dt_coef = (prev_dt === 0 ? 0 : dt/prev_dt);
		for(var i=0; i<arbiters.length; i++){
			arbiters[i].applyCachedImpulse(dt_coef);
		}
		
		for(var i=0; i<constraints.length; i++){
			var constraint = constraints[i];
			constraint.applyCachedImpulse(dt_coef);
		}
		
		// Run the impulse solver.
		//cpSpaceArbiterApplyImpulseFunc applyImpulse = this.arbiterApplyImpulse;
		for(var i=0; i<this.iterations; i++){
			for(var j=0; j<arbiters.length; j++){
				arbiters[j].applyImpulse();
			}
				
			for(var j=0; j<constraints.length; j++){
				constraints[j].applyImpulse();
			}
		}
		
		// Run the constraint post-solve callbacks
		for(var i=0; i<constraints.length; i++){
			constraints[i].postSolve(this);
		}
		
		// run the post-solve callbacks
		for(var i=0; i<arbiters.length; i++){
			var arb = arbiters[i];

			arb.handler.postSolve(arb, this);
		}
	} this.unlock(true);
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// These are utility routines to use when creating custom constraints.
// I'm not sure if this should be part of the private API or not.
// I should probably clean up the naming conventions if it is...

//#define J_MAX(constraint, dt) (((cpConstraint *)constraint)->maxForce*(dt))

// a and b are bodies.
var relative_velocity = function(a, b, r1, r2){
	var v1_sum = vadd(a.v, vmult(vperp(r1), a.w));
	var v2_sum = vadd(b.v, vmult(vperp(r2), b.w));
	
	return vsub(v2_sum, v1_sum);
};

var normal_relative_velocity = function(a, b, r1, r2, n){
	return vdot(relative_velocity(a, b, r1, r2), n);
};

/*
var apply_impulse = function(body, j, r){
	body.v = vadd(body.v, vmult(j, body.m_inv));
	body.w += body.i_inv*vcross(r, j);
};

var apply_impulses = function(a, b, r1, r2, j)
{
	apply_impulse(a, vneg(j), r1);
	apply_impulse(b, j, r2);
};
*/

var apply_impulse = function(body, jx, jy, r){
//	body.v = body.v.add(vmult(j, body.m_inv));
	body.v.x += jx * body.m_inv;
	body.v.y += jy * body.m_inv;
//	body.w += body.i_inv*vcross(r, j);
	body.w += body.i_inv*(r.x*jy - r.y*jx);
};

var apply_impulses = function(a, b, r1, r2, jx, jy)
{
	apply_impulse(a, -jx, -jy, r1);
	apply_impulse(b, jx, jy, r2);
};

var apply_bias_impulse = function(body, jx, jy, r)
{
	//body.v_bias = vadd(body.v_bias, vmult(j, body.m_inv));
	body.v_bias.x += jx * body.m_inv;
	body.v_bias.y += jy * body.m_inv;
	body.w_bias += body.i_inv*vcross2(r.x, r.y, jx, jy);
};

/*
var apply_bias_impulses = function(a, b, r1, r2, j)
{
	apply_bias_impulse(a, vneg(j), r1);
	apply_bias_impulse(b, j, r2);
};*/

var k_scalar_body = function(body, r, n)
{
	var rcn = vcross(r, n);
	return body.m_inv + body.i_inv*rcn*rcn;
};

var k_scalar = function(a, b, r1, r2, n)
{
	var value = k_scalar_body(a, r1, n) + k_scalar_body(b, r2, n);
	assertSoft(value !== 0, "Unsolvable collision or constraint.");
	
	return value;
};

// Returns [k1, k2].
var k_tensor = function(a, b, r1, r2)
{
	// calculate mass matrix
	// If I wasn't lazy and wrote a proper matrix class, this wouldn't be so gross...
	var k11, k12, k21, k22;
	var m_sum = a.m_inv + b.m_inv;
	
	// start with I*m_sum
	k11 = m_sum; k12 = 0;
	k21 = 0;  k22 = m_sum;
	
	// add the influence from r1
	var a_i_inv = a.i_inv;
	var r1xsq =  r1.x * r1.x * a_i_inv;
	var r1ysq =  r1.y * r1.y * a_i_inv;
	var r1nxy = -r1.x * r1.y * a_i_inv;
	k11 += r1ysq; k12 += r1nxy;
	k21 += r1nxy; k22 += r1xsq;
	
	// add the influnce from r2
	var b_i_inv = b.i_inv;
	var r2xsq =  r2.x * r2.x * b_i_inv;
	var r2ysq =  r2.y * r2.y * b_i_inv;
	var r2nxy = -r2.x * r2.y * b_i_inv;
	k11 += r2ysq; k12 += r2nxy;
	k21 += r2nxy; k22 += r2xsq;
	
	// invert
	var determinant = k11*k22 - k12*k21;
	assertSoft(determinant !== 0, "Unsolvable constraint.");
	
	var det_inv = 1/determinant;
  return [new Vect(k22*det_inv, -k12*det_inv), new Vect(-k21*det_inv,  k11*det_inv)];
};

var mult_k = function(vr, k1, k2)
{
	return new Vect(vdot(vr, k1), vdot(vr, k2));
};

var bias_coef = function(errorBias, dt)
{
	return 1 - Math.pow(errorBias, dt);
};

/* Copyright (c) 2007 Scott Lembcke
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// TODO: Comment me!

// a and b are bodies that the constraint applies to.
var Constraint = exports.Constraint = function(a, b)
{
	/// The first body connected to this constraint.
	this.a = a;
	/// The second body connected to this constraint.
	this.b = b;
	
  this.space = null;

	this.next_a = null;
	this.next_b = null;
	
	/// The maximum force that this constraint is allowed to use.
	this.maxForce = Infinity;
	/// The rate at which joint error is corrected.
	/// Defaults to pow(1 - 0.1, 60) meaning that it will
	/// correct 10% of the error every 1/60th of a second.
	this.errorBias = fpow(1 - 0.1, 60);
	/// The maximum rate at which joint error is corrected.
	this.maxBias = Infinity;
};

Constraint.prototype.activateBodies = function()
{
	if(this.a) this.a.activate();
	if(this.b) this.b.activate();
};

/// These methods are overridden by the constraint itself.
Constraint.prototype.preStep = function(dt) {};
Constraint.prototype.applyCachedImpulse = function(dt_coef) {};
Constraint.prototype.applyImpulse = function() {};
Constraint.prototype.getImpulse = function() { return 0; };

/// Function called before the solver runs. This can be overridden by the user
/// to customize the constraint.
/// Animate your joint anchors, update your motor torque, etc.
Constraint.prototype.preSolve = function(space) {};

/// Function called after the solver runs. This can be overridden by the user
/// to customize the constraint.
/// Use the applied impulse to perform effects like breakable joints.
Constraint.prototype.postSolve = function(space) {};
})();