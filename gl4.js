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

function Layer() {
    this.objects = {};
    this.behaviors = [];
    this.paused = false;
    this.behaviorCount = 0;
}

Layer.prototype.register = function (/*tag1, tag2, tag3, func*/) {
    var args = Array.prototype.slice.call(arguments, 0),
        func = args.slice(-1)[0],
        tags = args.slice(0, -1);

    var behavior = function () {
        gl4.forEach.apply(gl4.forEach, args);
    }

    behavior.id = ++this.behaviorCount;
    this.behaviors[behavior.id] = behavior;
    behavior.layer = this;
    return behavior;
}

Layer.prototype.unregister = function (behavior) {
    delete this.behaviors[behavior.id];
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
        tags = {},
        layers = [new Layer()],
        topLayer = layers[0],

        startTime = new Date,
        secondsElapsed = 0,

        // Used for generating unique ids for behaviors.
        objectCount = 0,
        // Number of images still loading.
        nLoading = 0,
        debug = false,

        soundsCount = 0,

        pressedKeys = {},

        // Used for FPS calculation.
        frameTime = 0,
        lastLoop = new Date,
        fps = 0,
        
        frameRequestId = 0,
        
        imgCache = {};

    var mouse = createEmptyObject(['mouse'],
                                  {x: 0, y: 0, angle: 0},
                                  {x: 0, y: 0, angle: 0})
    mouse.size = {x: 0, y: 0};
    mouse.isDown = false;
    // Avoid rendering.
    delete topLayer.objects[mouse.id];

    var screen = createEmptyObject(['screen'],
                                   {x: canvas.width / 2, y: canvas.height / 2, angle: 0},
                                   {x: 0, y: 0, angle: 0})
    screen.size = {x: canvas.width, y: canvas.height};
    // Avoid rendering.
    delete topLayer.objects[screen.id];

    context.textAlign = 'right'
    context.fillStyle = 'green';
    context.font = 'bold 16px Verdana';

    function updateFps() {
        var currentLoop = new Date;
        var timeDif = currentLoop - lastLoop;
        lastLoop = currentLoop;
        frameTime += (timeDif - frameTime) / FRAME_TIME_FILTER;
        fps = (1000 / frameTime).toFixed(1);

        secondsElapsed += timeDif / 1000;

        if (debug) {
            context.fillText(fps + ' fps', canvas.width, 20);
            context.fillText(Object.keys(topLayer.objects).length + ' objects', canvas.width, 36);
        }
    }

    function run() {
        if (nLoading === 0) {
            // Not more images to load, safe to run.
            step();
            render();
        } else if (debug) {
            context.fillText('LOADING', canvas.width, 68);
        }

        updateFps();

        frameRequestId = window.requestAnimationFrame(run);
    }

    function render() {
        layers.forEach(function (layer) {
            for (var i in layer.objects) {
                var object = layer.objects[i];
                context.save();
                context.translate(object.pos.x, object.pos.y);

                if (debug) {
                    // Print all tags on top right corner of object, one below
                    // the other.
                    var i = 0;
                    for (var tag in object.tags) {
                        var x = object.size.x / 2,
                            y = -object.size.y / 2 + i++ * 16;

                        context.fillText(tag, x, y);
                    }
                }

                context.rotate(-object.pos.angle);
                object.effects.forEach(function (effect) {
                    effect(context);
                });

                object.drawIn(context);
                context.restore();
            }
        });
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

        layers.forEach(function (layer) {
            if (layer.paused) {
                return;
            }

            for (var i in layer.objects) {
                var object = layer.objects[i];
                object.move(object.inertia);
                object.inertia.x *= (1 - object.friction.x);
                object.inertia.y *= (1 - object.friction.y);
                object.inertia.angle *= (1 - object.friction.angle);
            }

            for (var i in layer.behaviors) {
                layer.behaviors[i]();
            }
        });
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

            if (tags[0] === undefined) {
                firstList = MATCH_1;
            } else if (typeof tags[0] === 'string') {
                firstList = tagged(tags[0]); 
            } else {
                firstList = tags[0];
            }

            if (firstList.length === 0) {
                return;
            }

            parameters.push(null);
            for (var i in firstList) {
                var object = firstList[i];
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

            hitTest: function (other) {
                return !(this.pos.x - this.size.x / 2 > other.pos.x + other.size.x / 2 ||
                  this.pos.x + this.size.x / 2 < other.pos.x - other.size.x / 2 ||
                  this.pos.y - this.size.y / 2 > other.pos.y + other.size.y / 2 ||
                  this.pos.y + this.size.y / 2 < other.pos.y - other.size.y / 2)
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
            },

            tag: function (tagName) {
                this.tags[tagName] = tagName;
                tagged(tagName)[this.id] = this;
            },

            untag: function (tagName) {
                delete this.tags[tagName];
                delete tagged(tagName)[this.id];
            }
        };
        add(obj, tagsList);

        return obj;
    }

    function add(object, tagsList, layer) {
        layer = layer || topLayer;
        object.id = ++objectCount;
        object.layer = layer;
        layer.objects[object.id] = object;

        if (tagsList) {
            tagsList.forEach(function (tag) {
                tagged(tag)[object.id] = object;
                object.tags[tag] = tag;
            });
        }
    }

    function remove(object) {
        delete object.layer.objects[object.id];
        for (var tag in object.tags) {
            object.untag(tag);
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

    function preventDefault(event) {
        var hasCtrl = event.ctrlKey,
            isKnownSpecial = event.which in NAME_BY_KEYCODE,
            isAlpha = event.which >= 48 && event.which <= 90;

        if (!hasCtrl && (isKnownSpecial || isAlpha)) {
            event.preventDefault();
        }
    }

    window.addEventListener('keydown', function (event) {
        pressedKeys[event.which] = true;
        preventDefault(event);
    }, false);

    window.addEventListener('keyup', function (event) {
        delete pressedKeys[event.which];
        preventDefault(event);
    }, false);

    window.addEventListener('blur', function (event) {
        stop();
    }, false);

    run();

    return {
        mouse: mouse,
        screen: screen,

        add: add,
        remove: remove,

        seconds: function () {
            return secondsElapsed;
        },

        isPressed: function(key) {
            if (typeof key === 'string') {
                if (key.length === 1) {
                    key = key.toUpperCase().charCodeAt(0);
                } else {
                    key = KEYCODE_BY_NAME[key];
                }
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
        register: function() {
            return topLayer.register.apply(topLayer, arguments);
        },
        unregister: function() {
            return topLayer.unregister.apply(topLayer, arguments);
        },

        /**
         * Manually creates a new image object.
         *
         * `imgSource` is a URL pointing to an image.
         * `objTags` is an array of the tags the object will have.
         * `pos` is a {x, y, angle} dict of the desired initial position.
         * `inertia` is a {x, y, angle} dict of the desired initial inertia.
         * `friction` is a {x, y, angle} dict of the desired initial friction.
         */
        createImg: function (imgSource, objTags, pos, inertia, friction) {
            var obj = createEmptyObject(objTags, pos, inertia, friction);

            if (imgCache[imgSource] === undefined) {
                var img = new Image();
                imgCache[imgSource] = img;
                img.src = imgSource;
                nLoading++;
                img.addEventListener('load', function () {
                    nLoading--;
                });
            }
            obj.img = imgCache[imgSource];
            obj.drawIn = function (context) {
                context.drawImage(this.img, -this.size.x / 2, -this.size.y / 2);
            };

            if (obj.img.width != 0) {
                obj.size = {x: obj.img.width, y: obj.img.height}
            } else {
                obj.img.addEventListener('load', function () {
                    obj.size = {x: obj.img.width, y: obj.img.height}
                });
            }

            // Warning! Object has not been completely loaded yet.
            return obj;
        },

        createText: function (text, objTags, pos, inertia, friction, textProperties) {
            var obj = createEmptyObject(objTags, pos, inertia, friction);
            obj.text = text;
            obj.zero = function () { obj.text = 0; };
            obj.increment = function () { obj.text++; };
            obj.decrement = function () { obj.text--; };
            obj.isZero = function () { return obj.text == 0; };
            obj.isPositive = function () { return obj.text > 0; };
            obj.isNegative = function () { return obj.text < 0; };
            obj.drawIn = function (context) {
                context.textAlign = 'center';
                for (var property in textProperties) {
                    context[property] = textProperties[property];
                }
                context.fillText(obj.text, 0, 0);
            };

            return obj;
        },

        debug: function () {
            debug = true;
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

function randCircle(center, radius) {
    var pos = {x: 0, y: 0};
    gl4.register(function () {
        var angle = Math.random() * Math.PI * 2;
        pos.x = center.x + Math.cos(angle) * radius;
        pos.y = center.y + Math.sin(angle) * radius;
    });
    return pos;
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
