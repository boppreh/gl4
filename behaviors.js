/**
 * Creates a new behavior that moves all tagged objects with a fixed speed,
 * regardless and without touching their inertia.
 */
function move(target, speed) {
    return gl4.register(target, function (object) {
        object.move(speed);
    });
}

function moveTo(sourceTag, targetTag) {
    return gl4.register(sourceTag, targetTag, function (source, target) {
        source.pos.x = target.pos.x;
        source.pos.y = target.pos.y;
        source.pos.angle = target.pos.angle;
    });
}

/**
 * Accelerate tagged objects.
 */
function push(target, acceleration) {
    return gl4.register(target, function (object) {
        object.push(acceleration);
    });
}

/**
 * Accelerates tagged objects in direction to tagged targets.
 */
function attract(objTag, targetTag, force, maxTolerableDistance, turningSpeed) {
    attract = force !== undefined ? force : 5;
    turningSpeed = turningSpeed !== undefined ? turningSpeed : Math.PI;
    maxTolerableDistance = maxTolerableDistance !== undefined ? maxTolerableDistance : 10;
    var maxDistanceSquared = maxTolerableDistance * maxTolerableDistance;

    function findAngle(currentAngle, difX, difY) {
        var angle = Math.atan2(difY, difX);
        if (force < 0) {
            angle += Math.PI;
        }

        var totalAngularDifference = angle - currentAngle;
        if (totalAngularDifference > Math.PI) {
            totalAngularDifference -= Math.PI * 2;
        } else if (totalAngularDifference < -Math.PI) {
            totalAngularDifference += Math.PI * 2;
        }

        if (Math.abs(totalAngularDifference) <= turningSpeed) {
            return angle;
        }

        return currentAngle + (totalAngularDifference > 0 ? turningSpeed : -turningSpeed);
    }

    return gl4.register(objTag, targetTag, function (object, target) {
        var difX = target.pos.x - object.pos.x,
            difY = target.pos.y - object.pos.y;

        var distanceSquared = difX * difX + difY * difY;
        if ((force > 0 && distanceSquared <= maxDistanceSquared) ||
            (force < 0 && distanceSquared >= maxDistanceSquared)) {

            return;
        }
        
        if (force) {
            var angle = findAngle(Math.atan2(object.inertia.y, object.inertia.x), difX, difY),
                f = Math.abs(force);

            object.push({x: Math.cos(angle) * f, y: Math.sin(angle) * f});
        } else {
            object.pos.angle = findAngle(object.angle, difX, difY);
        }
    });
}

/**
 * Creates a new object every time the behavior is run.
 */
function create(img, tags, pos, inertia, friction) {
    return gl4.register(function () {
        var tagsCopy = tags.slice();
        gl4.create(img, tagsCopy, pos, inertia, friction);
    });
}

/**
 * Forces tagged object to stay within a specified rectangle, warping them to
 * the opposite end when the boundary is passed.
 */
function wrap(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: canvas.width, y: canvas.height};
    var size = {x: end.x - start.x, y: end.y - start.y};

    return gl4.register(target, function (object) {
        var pos = object.pos;

        if (pos.x < start.x) {
            pos.x += size.x;
        } else if (pos.x > end.x) {
            pos.x -= size.x;
        }

        if (pos.y < start.y) {
            pos.y += size.y;
        } else if (pos.y > end.y) {
            pos.y -= size.y;
        }
    });
}

function reflect(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: canvas.width, y: canvas.height};
    var size = {x: end.x - start.x, y: end.y - start.y};

    return gl4.register(target, function (object) {
        var pos = object.pos;
        var inertia = object.inertia;

        if (pos.x < start.x) {
            inertia.x = Math.abs(inertia.x);
        } else if (pos.x > end.x) {
            inertia.x = -Math.abs(inertia.x);
        }

        if (pos.y < start.y) {
            inertia.y = Math.abs(inertia.y);
        } else if (pos.y > end.y) {
            inertia.y = -Math.abs(inertia.y);
        }
    });
}

/**
 * Creates new objects from the origin of a tagged object, with the same angle.
 */
function shoot(origin, imgSource, tags, force, friction) {
    return gl4.register(origin, function (obj) {
        var angle = obj.pos.angle,
            distance = obj.size.x / 2,
            cos = -Math.cos(angle),
            sin = -Math.sin(angle),
            pos = {x: obj.pos.x + cos * distance,
                   y: obj.pos.y + sin * distance,
                   angle: angle},
            inertia = {x: cos * force,
                       y: sin * force};

        gl4.createImg(imgSource, tags, pos, inertia, friction);
    });
}

function tag(targets, tag) {
    return gl4.register(targets, function (target) {
        target.tags[tag] = tag;
        gl4.tagged(tag)[target.id] = target;
    });
}

function untag(targets, tag) {
    return gl4.register(targets, function (target) {
        delete target.tags[tag];
        delete gl4.tagged(tag)[target.id];
    });
}

/**
 * Plays a sound every time this behavior is run.
 */
function sound(src) {
    return gl4.register(function () {
        new Audio(src).play();
    });
}

function destroy(tag) {
    return gl4.register(tag, function (object) {
        gl4.remove(object);
    });
}
