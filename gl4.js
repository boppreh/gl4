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


var gl4 = {
    FRAME_TIME_FILTER: 10,
    MOTION_BLUR_STRENGTH: 0.5,
    KEYCODE_BY_NAME: {'space': 32, 'left': 37, 'up': 38, 'right': 39,
                      'down': 40, 'esc': 27, 'enter': 13},
    NAME_BY_KEYCODE: {},

    paused: false,

    canvas: document.getElementById('canvas'),
    context: canvas.getContext('2d'),
    layers: [],
    activeLayer: null,
    imgCache: {},

    // Number of images still loading.
    nLoading: 0,
    debug: false,
    pressedKeys: {},

    // Used for FPS calculation.
    frameTime: 0,
    lastLoop: new Date,
    fps: 0,
    seconds: 0,

    mouse: null,
    screen: null,

    futureFunctions: [],
};

gl4.schedule = function (delay, func) {
    if (func.id !== undefined) {
        this.unregister(func);
    }
    this.futureFunctions.push([this.seconds + delay, func]);
}

gl4.layer = function (layer) {
    layer = layer || new Layer();
    if (this.layers.indexOf(layer) === -1) {
        var currentIndex = this.layers.indexOf(this.activeLayer);
        this.layers.splice(currentIndex + 1, 0, layer);
    }
    this.activeLayer = layer;
    return layer;
};

gl4.unlayer = function (layer) {
    if (layer !== undefined && this.layers.indexOf(layer) === -1) {
        return;
    }
    layer = layer || this.activeLayer;
    var index = this.layers.indexOf(layer)
    this.layers.splice(index, 1);
    if (layer === this.activeLayer) {
        this.activeLayer = this.layers[index - 1] || this.layers[index];
    }
    return layer;
};

gl4.unlayerAll = function () {
    this.layers = [this.layers[0]];
    this.activeLayer = this.layers[0];
}

gl4.register = function () {
    return this.activeLayer.register.apply(this.activeLayer, arguments);
};

gl4.unregister = function () {
    return this.activeLayer.unregister.apply(this.activeLayer, arguments);
};

gl4.add = function () {
    this.activeLayer.add.apply(this.activeLayer, arguments);
};

gl4.remove = function () {
    this.activeLayer.remove.apply(this.activeLayer, arguments);
};

gl4.createImage = function () {
    var params = Array.prototype.slice(arguments, 0);
    var entity = new ImageEntity();
    ImageEntity.apply(entity, arguments);
    this.add(entity);
    return entity;
};

gl4.createText = function () {
    var params = Array.prototype.slice(arguments, 0);
    var entity = new TextEntity();
    TextEntity.apply(entity, arguments);
    this.add(entity);
    return entity;
};

gl4.tagged = function (tag) {
    return this.activeLayer.tagged.apply(this.activeLayer, arguments);
};

gl4.forEach = function (/*tags, callback*/) {
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
            firstList = gl4.tagged(tags[0]); 
        } else if (tags[0].id !== undefined) {
            firstList = [tags[0]];
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
};

gl4.render = function () {
    if (this.MOTION_BLUR_STRENGTH === 0) {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
        this.context.save();
        this.context.globalAlpha = 1 - this.MOTION_BLUR_STRENGTH;
        this.context.globalCompositeOperation = 'destination-out';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.restore();
    }

    for (var i in this.layers) {
        var layer = this.layers[i];
        for (var i in layer.entities) {
            this.context.save();
            layer.entities[i].render(this.context);
            this.context.restore();
        }
    }
};

gl4.step = function () {
    var oldActiveLayer = this.activeLayer;

    while (this.futureFunctions.length &&
           this.futureFunctions[0][0] <= this.seconds) {
        this.futureFunctions.shift()[1]();
    }

    for (var i in this.layers) {
        var layer = this.layers[i];
        if (layer.paused) {
            continue;
        }

        gl4.activeLayer = layer;

        for (var i in layer.entities) {
            layer.entities[i].step();
        }

        for (var i in layer.behaviors) {
            layer.behaviors[i]();
            if (gl4.activeLayer !== layer) {
                // Someone is messing with layers inside behaviors.
                // Throw the towel, discard the frame and let the programmer
                // choose what will be the next active layer.
                return;
            }
        }
    }

    this.activeLayer = oldActiveLayer;
};

gl4.processKeyEvent = function (event, value) {
    var keycode = event.which,
        hasCtrl = event.ctrlKey,
        isKnownSpecial = keycode in this.NAME_BY_KEYCODE,
        isAlpha = keycode >= 48 && keycode <= 90;

    this.pressedKeys[keycode] = value;
    if (isKnownSpecial) {
        this.pressedKeys[this.NAME_BY_KEYCODE[keycode]] = value;
    }
    if (isAlpha) {
        this.pressedKeys[String.fromCharCode(keycode).toUpperCase()] = value;
        this.pressedKeys[String.fromCharCode(keycode).toLowerCase()] = value;
    }

    if (!hasCtrl && (isKnownSpecial || isAlpha)) {
        event.preventDefault();
    }
};

window.addEventListener('mousemove', function (event) {
    var canvasBounds = gl4.canvas.getBoundingClientRect();
    var mouseX = event.clientX - canvasBounds.left,
        mouseY = event.clientY - canvasBounds.top;

    gl4.mouse.inertia.x = mouseX - gl4.mouse.pos.x;
    gl4.mouse.inertia.y = mouseY - gl4.mouse.pos.y;

    gl4.mouse.pos.x = mouseX;
    gl4.mouse.pos.y = mouseY;
}, false);

window.addEventListener('mousedown', function (event) {
    gl4.mouse.isDown = true;
}, false);

window.addEventListener('mouseup', function (event) {
    gl4.mouse.isDown = false;
}, false);

window.addEventListener('keydown', function (event) {
    gl4.processKeyEvent(event, true);
}, false);

window.addEventListener('keyup', function (event) {
    gl4.processKeyEvent(event, false);
}, false);

window.addEventListener('blur', function (event) {
    console.log('Should have stopped, but there\'s no stop yet.');
}, false);


function Layer() {
    this.entities = {};
    this.behaviors = [];
    this.tags = {};
    this.paused = false;
    this.behaviorCount = 0;
}

Layer.prototype.tagged = function(tag) {
    if (this.tags[tag] === undefined) {
        this.tags[tag] = {};
    }
    return this.tags[tag];
}

Layer.prototype.register = function (/*tag1, tag2, tag3, func*/) {
    var args = Array.prototype.slice.call(arguments, 0),
        func = args.slice(-1)[0],
        tags = args.slice(0, -1);

    var id = ++this.behaviorCount;

    var behavior = function () {
        func.id = id;
        gl4.forEach.apply(gl4.forEach, args);
    }

    behavior.id = id;
    this.behaviors[behavior.id] = behavior;
    behavior.layer = this;
    return behavior;
};

Layer.prototype.unregister = function (behavior) {
    delete this.behaviors[behavior.id];
};

Layer.prototype.add = function (entity) {
    if (entity.layer) {
        entity.layer.remove(entity);
    }
    entity.layer = this;
    this.entities[entity.id] = entity;
};

Layer.prototype.remove = function (entity) {
    delete this.entities[entity.id];
};

function Entity(draw, tags, pos, size, inertia, friction) {
    Entity.count = (Entity.count || 0) + 1;

    this.draw = draw;

    this.id = Entity.count;
    this.pos = fillDefault(pos, {x: gl4.canvas.width / 2,
                                 y: gl4.canvas.height / 2,
                                 angle: 0});
    this.size = fillDefault(size, {x: 0, y: 0});
    this.inertia = fillDefault(inertia, {x: 0, y: 0, angle: 0});
    this.friction = fillDefault(friction, {x: 0.8, y: 0.8, angle: 0.8});

    this.effects = {};
    this.tags = {};


    if (tags === undefined) {
        tags = [];
    } else if (typeof tags === 'string') {
        tags = [tags];
    }

    for (var i in tags) {
        this.tag(tags[i]);
    }
}

Entity.prototype.destroy = function () {
    this.layer.remove(this);
    for (var tag in this.tags) {
        this.untag(tag);
    }
};

Entity.prototype.render = function (context) {
    context.translate(this.pos.x, this.pos.y);

    if (gl4.debug) {
        // Print all tags on top right corner of entity, one below
        // the other.
        var i = 0;
        for (var tag in this.tags) {
            var x = this.size.x / 2,
                y = -this.size.y / 2 + i++ * 16;

            context.fillText(tag, x, y);
        }
        context.strokeRect(-this.size.x / 2, -this.size.y / 2,
                           this.size.x, this.size.y);
    }

    context.rotate(-this.pos.angle);
    for (var effectName in this.effects) {
        this.effects[effectName](context);
        delete this.effects[effectName];
    }

    this.draw(context);
};

Entity.prototype.hitTest = function (other) {
    return !(this.pos.x - this.size.x / 2 > other.pos.x + other.size.x / 2 ||
             this.pos.x + this.size.x / 2 < other.pos.x - other.size.x / 2 ||
             this.pos.y - this.size.y / 2 > other.pos.y + other.size.y / 2 ||
             this.pos.y + this.size.y / 2 < other.pos.y - other.size.y / 2);
};

Entity.prototype.move = function (speed) {
    this.pos.x += speed.x || 0;
    this.pos.y += speed.y || 0;
    this.pos.angle += speed.angle || 0;
    while (this.pos.angle < 0) {
        this.pos.angle += Math.PI * 2;
    }
    while (this.pos.angle > Math.PI * 2) {
        this.pos.angle -= Math.PI * 2;
    }
};

Entity.prototype.push = function (acceleration) {
    this.inertia.x += acceleration.x || 0;
    this.inertia.y += acceleration.y || 0;
    this.inertia.angle += acceleration.angle || 0;
};

Entity.prototype.tag = function (tag) {
    this.tags[tag] = tag;
    gl4.tagged(tag)[this.id] = this;
};

Entity.prototype.untag = function (tag) {
    delete this.tags[tag];
    delete gl4.tagged(tag)[this.id];
};

Entity.prototype.step = function () {
    this.move(this.inertia);
    this.inertia.x *= (1 - this.friction.x);
    this.inertia.y *= (1 - this.friction.y);
    this.inertia.angle *= (1 - this.friction.angle);
};


function TextEntity(value/*, rest of Entity params*/) {
    Entity.apply(this, Array.prototype.slice.call(arguments, 0));
    this.inertia.value = this.inertia.value || 0;
    this.friction.value = this.inertia.value || 0;

    this.value = value;
    this.color = '';
    this.font ='';
    this.alignment = 'center';
    this.prefix = '';
    this.suffix = '';
    this.minDigits = 0;
    this.minValue = Number.NEGATIVE_INFINITY;
    this.maxValue = Number.POSITIVE_INFINITY;
    this.decimalPoints = 0;

    function pad(value, length) {
        value = value + '';
        if (value.length >= length) {
            return value;
        }
        return new Array(length - value.length + 1).join('0') + value;
    }

    this.draw = function (context) {
        var strValue;
        if (typeof this.value === 'number') {
            strValue = this.value.toFixed(this.decimalPoints);
        } else {
            strValue = this.value;
        }
        var paddedValue = pad(strValue, this.minDigits),
            text = this.prefix + paddedValue + this.suffix;

        var measure = context.measureText(text);
        this.size.x = measure.width;
        this.size.y = +this.font.slice(0, this.font.indexOf(' ') - 2);

        context.fillStyle = this.color || context.fillStyle;
        context.font = this.font || context.font;
        context.textAlign = this.alignment || context.textAlign;
        context.fillText(text, 0, this.size.y / 2);
    }
}

TextEntity.prototype = Object.create(Entity.prototype);
TextEntity.prototype.constructor = TextEntity;

TextEntity.prototype.move = function (speed) {
    if (speed.value) {
        this.value += speed.value;
    }
    Entity.prototype.move.call(this, speed);
}

TextEntity.prototype.push = function (acceleration) {
    if (acceleration.value) {
        this.inertia.value += acceleration.value;
    }
    Entity.prototype.push.call(this, acceleration);
}

TextEntity.prototype.step = function () {
    Entity.prototype.step.call(this);
    if (!isNaN(this.value)) {
        this.value += this.inertia.value;
        this.value = Math.min(Math.max(this.value, this.minValue), this.maxValue);
        this.inertia.value *= (1 - this.friction.value);
    }
}

TextEntity.prototype.add = function (amount) {
    var self = this;
    amount = amount === undefined ? 1 : amount;
    return function() {
        self.value += amount;
    }
};

TextEntity.prototype.subtract = function (amount) {
    var self = this;
    amount = amount === undefined ? 1 : amount;
    return function() {
        self.value -= amount;
    }
};

TextEntity.prototype.at = function (min, max) {
    min = min || 0;
    max = max === undefined ? min : max;

    var self = this;
    return function() {
        if (self.value >= min && self.value <= max) {
            return [[self]];
        }
        return [];
    }
};


function ImageEntity(imageSource/*, rest of Entity params*/) {
    Entity.apply(this, Array.prototype.slice.call(arguments, 0));

    if (ImageEntity.cache[imageSource] === undefined) {
        var image = new Image();
        image.src = imageSource;
        var self = this;
        image.addEventListener('load', function () {
            self.size = {x: image.width, y: image.height};
        });

        ImageEntity.cache[imageSource] = image;
    }

    this.image = ImageEntity.cache[imageSource];
    this.size = {x: this.image.width, y: this.image.height};
    this.draw = function (context) {
        if (this.image.width !== 0) {
            context.scale(this.size.x / this.image.width,
                          this.size.y / this.image.height);

            context.drawImage(this.image,
                              -this.image.width / 2, -this.image.height / 2);
        }
    }
}

ImageEntity.prototype = Object.create(Entity.prototype);
ImageEntity.prototype.constructor = ImageEntity;

ImageEntity.cache = {};


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
gl4.layer(new Layer());

gl4.mouse = new Entity(null);
gl4.mouse.isDown = false;
gl4.screen = new Entity(null, [],
                        {x: canvas.width / 2, y: canvas.height / 2},
                        {x: canvas.width, y: canvas.height});

for (var name in gl4.KEYCODE_BY_NAME) {
    gl4.NAME_BY_KEYCODE[gl4.KEYCODE_BY_NAME[name]] = name;
}

gl4.context.textAlign = 'right'
gl4.context.fillStyle = 'green';
gl4.context.font = 'bold 16px Verdana';

(function () {

    function run() {
        window.requestAnimationFrame(run);
        if (gl4.paused) {
            return;
        }

        var currentLoop = new Date;
        var timeDif = currentLoop - gl4.lastLoop;
        gl4.lastLoop = currentLoop;
        gl4.frameTime += (timeDif - gl4.frameTime) / gl4.FRAME_TIME_FILTER;
        gl4.fps = (1000 / gl4.frameTime).toFixed(1);

        gl4.seconds += timeDif / 1000;

        gl4.step();
        gl4.render();

        if (gl4.debug) {
            gl4.context.fillText(gl4.fps + ' fps', gl4.canvas.width, 20);
        }
    }
    run();
}());
