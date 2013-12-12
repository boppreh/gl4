"use strict";

var gl4 = (function () {
    var FRAME_TIME_FILTER = 10,
        MOTION_BLUR_STRENGTH = 0.5;

    var canvas = document.getElementById('canvas'),
        context = canvas.getContext('2d'),

        running = false,
        objects = [],
        // Pseudo-object. Exists, but is not rendered or updated in `step`.
        mouse = {pos: {x: 0, y: 0, angle: 0},
                 inertia: {x: 0, y: 0, angle: 0},
                 size: {x: 0, y: 0},
                 isDown: false},
        tags = {'mouse': [mouse]},
        // Behaviors use a dictionary for cheap insertion and deletion.
        behaviors = {},
        // Used for generating unique ids for behaviors.
        behaviorCount = 0,
        // Number of images still loading.
        nLoading = 0,
        debug = false,

        // Stores the currently playing sounds similarly to the behaviors.
        sounds = {},
        soundsCount = 0,

        pressedKeys = {},

        // Used for FPS calculation.
        frameTime = 0,
        lastLoop = new Date,
        fps = 0;

    context.textAlign = 'right'
    context.fillStyle = 'green';
    context.font = 'bold 16px Verdana';

    function updateFps() {
        var currentLoop = new Date;
        var timeDif = currentLoop - lastLoop;
        lastLoop = currentLoop;
        frameTime += (timeDif - frameTime) / FRAME_TIME_FILTER;
        fps = (1000 / frameTime).toFixed(1);

        context.fillText(fps + ' fps', canvas.width, 20);
        context.fillText(objects.length + ' objects', canvas.width, 36);
    }

    function run() {
        if (!running) {
            // Will not request another frame and automatically stop running.
            return;
        }

        if (nLoading === 0) {
            // Not more images to load, safe to run.
            step();
            render();
        } else if (debug) {
            context.fillText('LOADING', canvas.width, 68);
        }

        if (debug) {
            updateFps();
        }

        window.requestAnimationFrame(run);
    }

    function render() {
        for (var i in objects) {
            var object = objects[i];
            context.save();
            context.translate(object.pos.x, object.pos.y);
            context.rotate(-object.pos.angle);
            context.drawImage(object.img, -object.size.x / 2, -object.size.y / 2);
            context.restore();

            if (debug) {
                // Print all tags on top right corner of object, one below the
                // other.
                for (var i = 0; i < object.tags.length; i++) {
                    var x = object.pos.x + object.size.x / 2,
                        y = object.pos.y - object.size.y / 2 + i * 16;

                    context.fillText(object.tags[i], x, y);
                }
            }
        }
    }

    function clearCanvas() {
        if (MOTION_BLUR_STRENGTH === 0) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            context.save();
            context.globalAlpha = 1 - MOTION_BLUR_STRENGTH;
            context.globalCompositeOperation = 'destination-out';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
        }
    }

    // Advance physics.
    function step() {
        clearCanvas();

        for (var i in objects) {
            var object = objects[i];
            object.move(object.inertia);
            object.inertia.x *= (1 - object.friction.x);
            object.inertia.y *= (1 - object.friction.y);
            object.inertia.angle *= (1 - object.friction.angle);
        }

        for (var id in behaviors) {
            behaviors[id]();
        }
    }

    function tagged(tag) {
        if (tags[tag] == undefined) {
            tags[tag] = [];
        }
        return tags[tag];
    }

    function forEach(/*tags, callback*/) {
        var args = Array.prototype.slice.call(arguments, 0),
            tags = args.slice(0, -1),
            callback = args.slice(-1)[0];

        function cartesianProduct(tags, parameters) {
            var firstList = tagged(tags[0]),
                rest = tags.slice(1),
                nPrevious = parameters.length;

            if (firstList.length == 0) {
                callback.apply(callback, parameters);
                return;
            }

            parameters.push(null);
            for (var i in firstList) {
                parameters[nPrevious] = firstList[i];
                cartesianProduct(rest, parameters);
            }
        }

        cartesianProduct(tags, []);
    }

    window.addEventListener('mousemove', function (event) {
        mouse.inertia.x = event.clientX - mouse.pos.x;
        mouse.inertia.y = event.clientY - mouse.pos.y;

        mouse.pos.x = event.clientX;
        mouse.pos.y = event.clientY;
    }, false);

    window.addEventListener('mousedown', function (event) {
        mouse.isDown = true;
    }, false);

    window.addEventListener('mouseup', function (event) {
        mouse.isDown = false;
    }, false);

    window.addEventListener('keydown', function (event) {
        pressedKeys[event.which] = true;
    }, false);

    window.addEventListener('keyup', function (event) {
        delete pressedKeys[event.which];
    }, false);

    return {
        mouse: mouse,

        isRunning: function () {
            return running;
        },

        isPressed: function(key) {
            if (typeof key === 'string') {
                key = {
                    'space': 32,
                    'left': 37,
                    'up': 38,
                    'right': 39,
                    'down': 40,
                }[key];
            }

            return pressedKeys[key] !== undefined;
        },

        tagged: tagged, 

        /**
         * Calls `callback` with each combination of tagged objects.
         *
         * Ex:
         * forEach('bullet', 'ship', callback)
         *
         * callback(bullet1, ship1);
         * callback(bullet1, ship2);
         * callback(bullet2, ship1);
         * callback(bullet2, ship2);
         * ...
         */
        forEach: forEach,

        /**
         * `register(func)` or `register(singleTag, func)`,
         * `register(tag1, tag2, tag3, func)`
         *
         * Register a new behavior. `func` is invoked once for every
         * tagged combination of items[1], or once every frame if not tags were
         * used.
         *
         * Returns a `behavior` object which can be unregistered or called
         * manually.
         *
         * No more than 2 tags must be used.
         *
         * [1]
         *   register(['bullet', 'ship'], func);
         *
         *   func(bullet1, ship1);
         *   func(bullet2, ship1);
         *   func(bullet1, ship2);
         *   ...
         */
        register: function (/*tag1, tag2, tag3, func*/) {
            var args = Array.prototype.slice.call(arguments, 0),
                func = args.slice(-1)[0],
                tags = args.slice(0, -1);

            var behavior = function () {
                forEach.apply(forEach, args);
            }

            behavior.id = behaviorCount++;
            behaviors[behavior.id] = behavior;
            return behavior;
        },

        /**
         * Unregisters a previously registered behavior.
         */
        unregister: function (behavior) {
            delete behaviors[behavior.id];
        },

        /**
         * Manually creates a new object.
         *
         * `imageSource` is a URL pointing to an image.
         * `objTags` is an array of the tags the object will have.
         * `pos` is a {x, y, angle} dict of the desired initial position.
         * `inertia` is a {x, y, angle} dict of the desired initial inertia.
         * `friction` is a {x, y, angle} dict of the desired initial friction.
         */
        create: function (imageSource, objTags, pos, inertia, friction) {
            if (typeof objTags === "string") {
                objTags = [objTags]
            }

            // Takes an object and fills empty values with defaults.
            function d(original, def) {
                original = original || {};
                var obj = {};

                for (var property in def) {
                    var cur = original[property];
                    obj[property] = cur !== undefined ? cur : def[property];
                }

                return obj;
            }

            var obj = {
                tags: objTags,
                pos: d(pos, {x: 0, y: 0, angle: 0}),
                inertia: d(inertia, {x: 0, y: 0, angle: 0}),
                friction: d(friction, {x: 0.8, y: 0.8, angle: 0.8}),
                img: new Image(),

                move: function (speed) {
                    this.pos.x += speed.x || 0;
                    this.pos.y += speed.y || 0;
                    this.pos.angle += speed.angle || 0;
                    while (this.pos.angle < 0) {
                        this.pos.angle += Math.PI * 2;
                    }
                    while (this.pos.angle > Math.PI * 2) {
                        this.pos.angle -= Math.PI * 2;
                    }
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

                objects.push(obj);
                objTags.forEach(function (tag) {
                    tagged(tag).push(obj);
                });
            };
            obj.img.src = imageSource;

            // Warning! Object has not been completely loaded yet.
            return obj;
        },

        /**
         * Starts running the simulation. `debugMode` specifies if the FPS
         * counter and tag annotations will appear.
         *
         * If not provided, `debugMode` falls back to the last value used
         * (defaults to `false`).
         */
        start: function (debugMode) {
            debug = debugMode || debug;

            window.requestAnimationFrame(run);
            running = true;
        },

        /**
         * Stops running the simulation.
         */
        stop: function () {
            running = false;

            if (debug) {
                // This text will be automatically erased the next time the
                // canvas is cleaned.
                context.fillText('PAUSED', canvas.width, 52);
            }
        },
    };
}());

/**
 * Creates a new behavior that moves all tagged objects with a fixed speed,
 * regardless and without touching their inertia.
 */
function move(target, speed) {
    return gl4.register(target, function (object) {
        object.move(speed);
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
    turningSpeed = turningSpeed !== undefined ? turningSpeed : 30;
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

        gl4.create(imgSource, tags, pos, inertia, friction);
    });
}

var MATCH_1 = [];
var MATCH_2 = [];
var MATCH_3 = [];

function on(condition/*, ...behaviors*/) {
    var behaviors = Array.prototype.slice.call(arguments, 1);
    for (var i in behaviors) {
        if (behaviors[i].id === undefined) {
            // Object is a raw function and must be converted to behavior.
            behaviors[i] = gl4.register(behaviors[i]);
        }

        // Stop the kernel from calling the behaviors automatically.
        gl4.unregister(behaviors[i]);
    }

    function runBehaviors(match1, match2, match3) {
        MATCH_1[0] = match1;
        MATCH_2[0] = match2;
        MATCH_3[0] = match3;

        for (var i in behaviors) {
            behaviors[i]();
        }
    }

    console.log(condition);
    return gl4.register(function () {
        var result = condition(runBehaviors);
        // Allow conditions to return true instead of using the callback.
        if (result === true) {
            runBehaviors();
        }
    });
}

function mouseDown() {
    return gl4.isMouseDown;
}

function keyDown(key) {
    return function() {
        return gl4.isPressed(key);
    }
}

function hit(objectTag, targetTag) {
    return function(callback) {
        gl4.forEach(objectTag, targetTag, function(object, target) {
            if (!(object.pos.x - object.size.x / 2 > target.pos.x + target.size.x / 2 ||
                  object.pos.x + object.size.x / 2 < target.pos.x - target.size.x / 2 ||
                  object.pos.y - object.size.y / 2 > target.pos.y + target.size.y / 2 ||
                  object.pos.y + object.size.y / 2 < target.pos.y - target.size.y / 2)) {

                callback(object, target);
            }
        });
    }
}

/**
 * Plays a sound every time this behavior is run.
 */
function sound(src) {
    return gl4.register(function () {
        new Audio(src).play();
    });
}

/**
 * Returns an object with randomized attributes, between the given min and max
 * dictionary values. The attributes are re-randomized every frame.
 */
function r(minValues, maxValues) {
    var obj = {};

    function update() {
        for (var property in minValues) {
            var min = minValues[property];
            var max = maxValues[property];

            if (max === undefined) {
                obj[property] = min;
                continue;
            }

            obj[property] = Math.random() * (max - min) + min;
        }
    }

    gl4.register(update);
    update();

    return obj;
}

gl4.start(true);
