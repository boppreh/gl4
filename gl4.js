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
            context.globalCompositeOperation = 'destination-out';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
        }
    }

    function runBehavior(behavior) {
        // Number of tags could be abstracted to N if we used a recursive
        // function, but the complexity and performance penalty is not worth it
        // right now. Especially in cases like collision detection, where
        // number of calls could be nObjects^2, function overhead would
        // dominate.

        if (behavior.tags.length === 0) {
            behavior.func();

        } else if (behavior.tags.length === 1) {
            var tagged = tags[behavior.tags[0]];
            for (var i in tagged) {
                behavior.func(tagged[i]);
            }

        } else if (behavior.tags.length === 2) {
            var tagged1 = tags[behavior.tags[0]];
            var tagged2 = tags[behavior.tags[1]];
            for (var i in tagged1) {
                for (var j in tagged2) {
                    behavior.func(tagged1[i], tagged2[j]);
                }
            }
        }
    }

    function stepObject(object) {
        object.move(object.inertia);
        object.inertia.x *= (1 - object.friction.x);
        object.inertia.y *= (1 - object.friction.y);
        object.inertia.angle *= (1 - object.friction.angle);
        // TODO: Update `object.size` on rotation.

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

    // Advance physics.
    function step() {
        clearCanvas();

        for (var id in behaviors) {
            runBehavior(behaviors[id]);
        }

        objects.forEach(stepObject);
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
        // Regular keycode.
        pressedKeys[event.which] = true;
        // String representation (e.g. 'spacebar', 'enter').
        pressedKeys[event.key.toLowerCase()] = true;
    }, false);

    window.addEventListener('keyup', function (event) {
        delete pressedKeys[event.which];
        delete pressedKeys[event.key.toLowerCase()];
    }, false);

    return {
        mouse: mouse,

        isRunning: function () {
            return running;
        },

        isPressed: function(key) {
           return pressedKeys[key] !== undefined;
       },

        tagged: function (tag) {
            return tags[tag] || [];
        },

        /**
         * `register(func)` or `register(singleTag, func)`,
         * `register([manyTags], func)`
         *
         * Register a new behavior. `func` is invoked once for every
         * tagged combination of items[1], or once every frame if not tags were
         * used.
         *
         * Returns a `behavior` object which can be unregistered or `run`
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
        register: function (tags, func) {
            if (func === undefined) {
                func = tags;
                tags = [];
            } else if (typeof tags === "string") {
                tags = [tags]
            }

            if (tags.length > 2) {
                console.error('Behavior must have two or less declared tags.', tags);
            }

            var behavior = {id: behaviorCount++,
                            tags: tags,
                            func: func,
                            run: function() {
                                runBehavior(this);
                            }};
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
                    if (tags[tag] === undefined) {
                        tags[tag] = [obj];
                    } else {
                        tags[tag].push(obj);
                    }
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

/**
 * Runs a behavior while the mouse left button is pressed.
 */
function onMouseDown(behavior) {
    gl4.unregister(behavior);

    return gl4.register(function () {
        if (gl4.isMouseDown()) {
            behavior.run();
        }
    });
}

/**
 * Runs a behavior while a given key is pressed.
 */
function onPressed(key, behavior) {
    gl4.unregister(behavior);

    return gl4.register(function () {
        if (gl4.isPressed(key)) {
            behavior.run();
        }
    });
}

/**
 * Runs a behavior while there are collisions between the two types of tagged
 * objects.
 */
function onHit(object, target) {
    var behaviors = Array.prototype.slice.call(arguments, 2);
    for (var i in behaviors) {
        gl4.unregister(behaviors[i]);
    }

    return gl4.register([object, target], function (object, target) {
        if (!(object.pos.x - object.size.x / 2 > target.pos.x + target.size.x / 2 ||
              object.pos.x + object.size.x / 2 < target.pos.x - target.size.x / 2 ||
              object.pos.y - object.size.y / 2 > target.pos.y + target.size.y / 2 ||
              object.pos.y + object.size.y / 2 < target.pos.y - target.size.y / 2)) {

            for (var i in behaviors) {
                behaviors[i].run();
            }
        }
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

gl4.start(true);
