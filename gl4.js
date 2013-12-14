"use strict";

// Compatibility for older Firefox and Opera versions.
if (window.requestAnimationFrame === undefined) {
    window.requestAnimationFrame = function (handler) {
        return setTimeout(handler, 1000 / 60);
    }
    window.cancleAnimationFrame = function (requestId) {
        return clearTimeout(requestId);
    }
}

var gl4 = (function () {

    var FRAME_TIME_FILTER = 10,
        MOTION_BLUR_STRENGTH = 0.5,
        KEYCODE_BY_NAME = {'space': 32, 'left': 37, 'up': 38, 'right': 39, 'down': 40, 'esc': 27, 'enter': 13},
        NAME_BY_KEYCODE = {};

    for (var name in KEYCODE_BY_NAME) {
        NAME_BY_KEYCODE[KEYCODE_BY_NAME[name]] = name;
    }

    var canvas = document.getElementById('canvas'),
        context = canvas.getContext('2d'),

        startTime = new Date,
        secondsElapsed = 0,

        running = false,
        objects = [],
        // Pseudo-object. Exists, but is not rendered or updated in `step`.
        mouse = {pos: {x: 0, y: 0, angle: 0},
                 inertia: {x: 0, y: 0, angle: 0},
                 size: {x: 0, y: 0},
                 isDown: false},
        screen = {pos: {x: canvas.width / 2, y: canvas.height / 2, angle: 0},
                  inertia: {x: 0, y: 0, angle: 0},
                  size: {x: canvas.width, y: canvas.height}},
        tags = {'mouse': [mouse], 'screen': [screen]},
        // Behaviors use a dictionary for cheap insertion and deletion.
        behaviors = {},
        // Used for generating unique ids for behaviors.
        behaviorCount = 0,
        objectCount = 0,
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
        fps = 0,
        
        frameRequestId = 0;

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
        secondsElapsed = (new Date - startTime) / 1000;

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

        frameRequestId = window.requestAnimationFrame(run);
    }

    function render() {
        for (var i in objects) {
            var object = objects[i];
            context.save();
            context.translate(object.pos.x, object.pos.y);

            if (debug) {
                // Print all tags on top right corner of object, one below the
                // other.
                var i = 0;
                for (var tag in object.tags) {
                    var x = object.size.x / 2,
                        y = -object.size.y / 2 + i++ * 16;

                    context.fillText(tag, x, y);
                }
            }

            context.rotate(-object.pos.angle);
            for (var i in object.effects) {
                object.effects[i](context);
            }
            object.drawIn(context);
            context.restore();
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
            tags[tag] = {};
        }
        return tags[tag];
    }

    function forEach(/*tags, callback*/) {
        var args = Array.prototype.slice.call(arguments, 0),
            tags = args.slice(0, -1),
            callback = args.slice(-1)[0];

        function cartesianProduct(tags, parameters) {
            if (tags.length == 0) {
                callback.apply(callback, parameters);
                return;
            }
            
            var firstList = null,
                rest = tags.slice(1),
                nPrevious = parameters.length;

            if (typeof tags[0] === 'string') {
                firstList = tagged(tags[0]); 
            } else {
                firstList = tags[0];
            }

            if (firstList.length === 0) {
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

    function createEmptyObject(tagsList, pos, inertia, friction) {
        if (tagsList === undefined) {
            tagsList = [];
        } else if (typeof tagsList === 'string') {
            tagsList = [tagsList]
        }

        var obj = {
            tags: {},
            pos: fillDefault(pos, {x: canvas.width / 2, y: canvas.height / 2, angle: 0}),
            inertia: fillDefault(inertia, {x: 0, y: 0, angle: 0}),
            friction: fillDefault(friction, {x: 0.8, y: 0.8, angle: 0.8}),
            size: {x: 0, y: 0},

            effects: [],

            drawIn: function (context) {
                console.error('Can\'t draw an empty object!', this)
            },

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
        add(obj, tagsList);

        return obj;
    }

    function add(object, tagsList) {
        object.id = ++objectCount;
        objects.push(object);

        if (tagsList) {
            tagsList.forEach(function (tag) {
                tagged(tag)[object.id] = object;
                object.tags[tag] = tag;
            });
        }
    }

    function remove(object) {
        objects.splice(objects.indexOf(object), 1);
        for (var tag in object.tags) {
            delete tagged(tag)[object.id];
            delete object.tags[tag];
        }
    }

    window.addEventListener('mousemove', function (event) {
        var canvasBounds = canvas.getBoundingClientRect();
        var mouseX = event.clientX - canvasBounds.left,
            mouseY = event.clientY - canvasBounds.top;

        mouse.inertia.x = mouseX - mouse.pos.x;
        mouse.inertia.y = mouseY - mouse.pos.y;

        mouse.pos.x = mouseX;
        mouse.pos.y = mouseY;
    }, false);

    window.addEventListener('mousedown', function (event) {
        mouse.isDown = true;
    }, false);

    window.addEventListener('mouseup', function (event) {
        mouse.isDown = false;
    }, false);

    window.addEventListener('keydown', function (event) {
        pressedKeys[event.which] = true;
        if (event.which in NAME_BY_KEYCODE) {
            event.preventDefault();
        }
    }, false);

    window.addEventListener('keyup', function (event) {
        delete pressedKeys[event.which];
        if (event.which in NAME_BY_KEYCODE) {
            event.preventDefault();
        }
    }, false);

    return {
        mouse: mouse,
        screen: screen,

        add: add,
        remove: remove,

        seconds: function () {
            return secondsElapsed;
        },

        isRunning: function () {
            return running;
        },

        isPressed: function(key) {
            if (typeof key === 'string') {
                key = KEYCODE_BY_NAME[key];
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
         * Manually creates a new image object.
         *
         * `imageSource` is a URL pointing to an image.
         * `objTags` is an array of the tags the object will have.
         * `pos` is a {x, y, angle} dict of the desired initial position.
         * `inertia` is a {x, y, angle} dict of the desired initial inertia.
         * `friction` is a {x, y, angle} dict of the desired initial friction.
         */
        createImg: function (imageSource, objTags, pos, inertia, friction) {
            var obj = createEmptyObject(objTags, pos, inertia, friction);
            obj.img = new Image();
            obj.drawIn = function (context) {
                context.drawImage(this.img, -this.size.x / 2, -this.size.y / 2);
            };

            nLoading++;
            obj.img.onload = function () {
                nLoading--;
                obj.size = {x: obj.img.width, y: obj.img.height}
            };
            obj.img.src = imageSource;

            // Warning! Object has not been completely loaded yet.
            return obj;
        },

        createText: function (text, objTags, pos, inertia, friction, textProperties) {
            var obj = createEmptyObject(objTags, pos, inertia, friction);
            obj.text = text;
            obj.zero = function () { obj.text = 0; };
            obj.increment = function () { obj.text++; };
            obj.decrement = function () { obj.text--; };
            obj.isZero = function () { obj.text == 0; };
            obj.isPositive = function () { obj.text > 0; };
            obj.isNegative = function () { obj.text < 0; };
            obj.drawIn = function (context) {
                context.textAlign = 'center';
                for (var property in textProperties) {
                    context[property] = textProperties[property];
                }
                context.fillText(obj.text, 0, 0);
            };

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

            if (!running) {
                window.requestAnimationFrame(run);
                running = true;
            }
        },

        /**
         * Stops running the simulation.
         */
        stop: function () {
            running = false;

            if (frameRequestId !== 0) {
                window.cancelAnimationFrame(frameRequestId);
            }

            if (debug) {
                // This text will be automatically erased the next time the
                // canvas is cleaned.
                context.fillText('PAUSED', canvas.width, 52);
            }
        },
    };
}());

/**
 * Returns an object with randomized attributes, between the given min and max
 * dictionary values. The attributes are re-randomized every frame.
 */
function rand(minValues, maxValues) {
    var obj = {};

    function update() {
        for (var property in minValues) {
            var min = minValues[property] || 0,
                max = maxValues[property] || 0;

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

// Takes an object and fills empty values with defaults.
function fillDefault(original, def) {
    original = original || {};
    var obj = {};

    for (var property in def) {
        var cur = original[property];
        obj[property] = cur !== undefined ? cur : def[property];
    }

    return obj;
}

gl4.start();
