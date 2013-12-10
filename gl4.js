"use strict";

var gl4 = (function () {
    var FRAME_TIME_FILTER = 10,
        MOTION_BLUR_STRENGTH = 0.5;

    var canvas = document.getElementById("canvas"),
        context = canvas.getContext("2d"),
        running = false,
        objects = [],
        mouse = {pos: {x: 0, y: 0, angle: 0},
                 inertia: {x: 0, y: 0, angle: 0},
                 size: {x: 0, y: 0}},
        tags = {"mouse": [mouse]},
        behaviors = {},
        nLoading = 0,
        frameTime = 0,
        lastLoop = new Date,
        fps = 0,
        debug = false,
        mouseDown = false,
        behaviorCount = 0;

    context.textAlign = "right"
    context.fillStyle = "green";
    context.font = "bold 16px Verdana";

    function updateFps() {
        var currentLoop = new Date;
        var timeDif = currentLoop - lastLoop;
        lastLoop = currentLoop;
        frameTime += (timeDif - frameTime) / FRAME_TIME_FILTER;
        fps = (1000 / frameTime).toFixed(1);

        context.fillText(fps + " fps", canvas.width, 20);
        context.fillText(objects.length + " objects", canvas.width, 36);
    }

    function run() {
        if (!running) {
            return;
        }

        if (nLoading === 0) {
            step();
        }

        if (debug) {
            updateFps();
        }

        window.requestAnimationFrame(run);
    }

    function clearCanvas() {
        if (MOTION_BLUR_STRENGTH === 0) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            context.save();
            context.globalAlpha = 1 - MOTION_BLUR_STRENGTH;
            context.globalCompositeOperation = "destination-out";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
        }
    }

    function runBehavior(behavior) {
        var tagged = tags[behavior.tags[0]];

        if (behavior.tags.length === 0) {
            behavior.func();

        } else if (behavior.tags.length === 1) {
            if (!tags[behavior.tags[0]]) {
                return;
            }

            for (var i in tagged) {
                behavior.func(tagged[i]);
            }

        } else if (behavior.tags.length === 2) {
            if (!tags[behavior.tags[0]] && !tags[behavior.tags[1]]) {
                return;
            }

            var tagged2 = tags[behavior.tags[1]];
            for (var i in tagged) {
                for (var j in tagged2) {
                    behavior.func(tagged[i], tagged2[j]);
                }
            }
        }
    }

    function stepObject(object) {
        object.move(object.inertia);
        object.inertia.x *= (1 - object.friction.x);
        object.inertia.y *= (1 - object.friction.y);
        object.inertia.angle *= (1 - object.friction.angle);

        context.save();
        context.translate(object.pos.x, object.pos.y);
        context.rotate(object.pos.angle);
        context.drawImage(object.img, -object.size.x / 2, -object.size.y / 2);
        context.restore();

        if (debug) {
            for (var i = 0; i < object.tags.length; i++) {
                var x = object.pos.x + object.size.x / 2,
                    y = object.pos.y - object.size.y / 2 + i * 16;

                context.fillText(object.tags[i], x, y);
            }
        }
    }

    function step() {
        clearCanvas();
        objects.forEach(stepObject);

        for (var id in behaviors) {
            runBehavior(behaviors[id]);
        }
    }

    window.onmousemove = function (event) {
        mouse.inertia.x = event.clientX - mouse.pos.x;
        mouse.inertia.y = event.clientY - mouse.pos.y;

        mouse.pos.x = event.clientX;
        mouse.pos.y = event.clientY;
    };

    window.onmousedown = function (event) {
        mouseDown = true;
    };

    window.onmouseup = function (event) {
        mouseDown = false;
    };

    return {
        isMouseDown: function () {
            return mouseDown;
        },

        isRunning: function () {
            return running;
        },

        tagged: function (tag) {
            return tags[tag] || [];
        },

        register: function (tags, func) {
            if (func === undefined) {
                func = tags;
                tags = [];
            }

            if (tags.length > 2) {
                console.error("Behavior must have two or less declared tags.", tags);
            }

            var behavior = {id: behaviorCount++, tags: tags, func: func};
            behaviors[behavior.id] = behavior;

            return behavior;
        },

        unregister: function (behavior) {
            delete behaviors[behavior.id];
        },

        create: function (imageSource, objTags, pos, inertia, friction) {
            var obj = {
                tags: objTags,
                pos: pos || {x: 0, y: 0, angle: 0},
                inertia: inertia || { x: 0, y: 0, angle: 0},
                friction: friction || {x: 0.8, y: 0.8, angle: 0},
                img: new Image(),

                move: function (speed) {
                    this.pos.x += speed.x || 0;
                    this.pos.y += speed.y || 0;
                    this.pos.angle += speed.angle || 0;
                },

                push: function (acceleration) {
                    this.inertia.x += acceleration.x || 0;
                    this.inertia.y += acceleration.y || 0;
                    this.inertia.angle += acceleration.angle || 0;
                }
            };

            nLoading++;
            obj.img.onload = function () {
                nLoading--;
                obj.size = {x: obj.img.width, y: obj.img.height}
            };
            obj.img.src = imageSource;

            objects.push(obj);
            objTags.forEach(function (tag) {
                if (tags[tag] === undefined) {
                    tags[tag] = [obj];
                } else {
                    tags[tag].push(obj);
                }
            });
        },

        start: function (debugMode) {
            debug = debugMode || debug;

            window.requestAnimationFrame(run);
            running = true;
        },

        stop: function () {
            running = false;
        },

        runBehavior: runBehavior
    };
}());

function move(target, speed) {
    return gl4.register([target], function (object) {
        object.move(speed);
    });
}

function push(target, acceleration) {
    return gl4.register([target], function (object) {
        object.push(acceleration);
    });
}

function follow(objTag, targetTag, force, turningSpeed, maxTolerableDistance) {
    force = force !== undefined ? force : 5;
    turningSpeed = turningSpeed !== undefined ? turningSpeed : 30;
    maxTolerableDistance = maxTolerableDistance !== undefined ? maxTolerableDistance : 10;

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

    return gl4.register([objTag, targetTag], function (object, target) {
        var difX = target.pos.x - object.pos.x,
            difY = target.pos.y - object.pos.y;

        if (difX * difX + difY * difY <= maxTolerableDistance * maxTolerableDistance) {
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

function create(img, tags, pos, inertia, friction) {
    pos = pos || {};
    inertia = inertia || {};
    friction = friction || {x: 0.8, y: 0.8, angle: 0};

    // Clones a {x, y, angle} triple to avoid mutating the same object.
    function c(triple) {
        return {x: triple.x || 0, y: triple.y || 0, angle: triple.angle || 0};
    }

    return gl4.register(function () {
        gl4.create(img, tags.slice(), c(pos), c(inertia), c(friction));
    });
}

function onMouseDown(behavior) {
    gl4.unregister(behavior);

    return gl4.register(function () {
        if (gl4.isMouseDown()) {
            gl4.runBehavior(behavior);
        }
    });
}

function wrap(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: canvas.width, y: canvas.height};
    var size = {x: end.x - start.x, y: end.y - start.y};

    return gl4.register([target], function (object) {
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

function onHit(object, target, behavior) {
    gl4.unregister(behavior);

    return gl4.register([object, target], function (object, target) {
        if (!(object.pos.x - object.size.x / 2 > target.pos.x + target.size.x / 2 ||
              object.pos.x + object.size.x / 2 < target.pos.x - target.size.x / 2 ||
              object.pos.y - object.size.y / 2 > target.pos.y + target.size.y / 2 ||
              object.pos.y + object.size.y / 2 < target.pos.y - target.size.y / 2)) {

            gl4.runBehavior(behavior);
        }
    });
}

gl4.start(true);
