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
function follow(objTag, targetTag, force, maxTolerableDistance, turningSpeed) {
    force = force !== undefined ? force : 5;
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

function attract(objectTag, targetTag, constantForce, elasticForce) {
    constantForce = constantForce === undefined ? 5 : constantForce;
    elasticForce = elasticForce === undefined ? 0 : elasticForce;

    return gl4.register(objectTag, targetTag, function (object, target) { 
        var difX = target.pos.x - object.pos.x,
            difY = target.pos.y - object.pos.y,
            angle = Math.atan2(difY, difX),
            distance = Math.max(Math.sqrt(difX * difX + difY * difY), 1),
            f = constantForce + 1 / distance * elasticForce;

        object.push({x: Math.cos(angle) * f, y: Math.sin(angle) * f});
    });
}

/**
 * Creates a new object every time the behavior is run.
 */
function create(img, tags, pos, inertia, friction) {
    return gl4.register(function () {
        var tagsCopy = tags.slice();
        gl4.createImage(img, tagsCopy, pos, inertia, friction);
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

function slowDown(tag, slowness) {
    slowness = fillDefault(slowness, {x: 0.5, y: 0.5, angle: 0.5});
    return gl4.register(tag, function (object) {
        object.inertia.x *= 1 - slowness.x;
        object.inertia.y *= 1 - slowness.y;
        object.inertia.angle *= 1 - slowness.angle;
    });
}

function tag(targets, tag) {
    return gl4.register(targets, function (target) {
        target.tag(tag);
    });
}

function untag(targets, tag) {
    return gl4.register(targets, function (target) {
        target.untag(tag);
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
        object.destroy();
    });
}

function fadeOut(tag, speed) {
    speed = speed === undefined ? 0.05 : speed;

    return gl4.register(tag, function (object) {
        object.alpha -= speed;
        if (object.alpha <= 0) {
            object.destroy();
        }
    });
}

function fadeIn(tag, speed) {
    speed = speed === undefined ? 0.05 : speed;

    return gl4.register(tag, function (object) {
        object.alpha += speed;
    });
}

function expand(tag, speed) {
    if (speed === undefined) {
        speed = {x: 0.01, y: 0.01};
    } else if (typeof speed === 'number') {
        speed = {x: speed, y: speed};
    }

    return gl4.register(tag, function (object) {
        object.size.x *= 1 + speed.x;
        object.size.y *= 1 + speed.y;
    });
}

function glow(object, color, size) {
    size = size === undefined ? 8 : size;
    color = color === undefined ? 'white' : color;
    function effect(context) {
        context.shadowColor = color;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = size;
    }
    return gl4.register(object, function (object) {
        object.effects['shadow'] = effect;
    });
}

function shadow(object, offset, blur, color) {
    color = color === undefined ? 'black' : color;
    blur = blur === undefined ? 3 : blur;
    offset = fillDefault(offset, {x: 2, y: 2});

    function effect(context) {
        context.shadowColor = color;
        context.shadowOffsetX = offset.x;
        context.shadowOffsetY = offset.y;
        context.shadowBlur = blur;
    }

    return gl4.register(object, function (object) {
        object.effects['shadow'] = effect;
    });
}

function alpha(object, amount) {
    amount = amount === undefined ? 0.5 : amount;

    return gl4.register(object, function (object) {
        object.alpha = amount;
    });
}

function delay(interval, behavior) {
    interval = interval || 1;
    if (behavior.id !== undefined) {
        gl4.unregister(behavior);
    }

    var nextTimes = [];
    var matches = [];

    gl4.register(function () {
        if (nextTimes.length && nextTimes[0] <= gl4.seconds) {
            nextTimes.shift();
            var match = matches.shift();
            var backup = [MATCH_1[0], MATCH_2[0], MATCH_3[0]];
            MATCH_1[0] = match[0];
            MATCH_2[0] = match[1];
            MATCH_3[0] = match[2];
            behavior();
            MATCH_1[0] = backup[0];
            MATCH_2[0] = backup[1];
            MATCH_3[0] = backup[2];
        }
    });

    return gl4.register(function () {
        nextTimes.push(gl4.seconds + interval);
        matches.push([MATCH_1[0], MATCH_2[0], MATCH_3[0]]);
    });
}

function once(behaviors) {
    if (behaviors.id) {
        behaviors = [behaviors];
    }

    for (var i in behaviors) {
        gl4.unregister(behaviors[i]);
        behaviors[i]();
    }
}
