"use strict";

var gl4 = (function() {
    var canvas = document.getElementById("canvas");
    var context = canvas.getContext("2d");

    var running = false;

    var objects = [];
    var tags = {};

    var behaviors = [];

    function render() {
        if (!running) {
            return
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        objects.forEach(function(object) {
            object.pos.x += object.inertia.x;
            object.pos.y += object.inertia.y;
            context.drawImage(object.img, object.pos.x, object.pos.y);
        });

        behaviors.forEach(function(behavior) {
            if (!tags[behavior.tag]) {
                return;
            }

            tags[behavior.tag].forEach(behavior.func);
        });

        window.requestAnimationFrame(render);
    }

    return {
        tags: tags,

        isRunning: function() { return running; },

        tagged: function(tag) {
            return tags[tag] || [];
        },

        register: function(tag, func) {
            behaviors.push({tag: tag, func: func});
        },

        create: function(imageSource, objTags, pos, inertia) {
            pos = pos || {x: 0, y: 0};
            inertia = inertia || {x: 0, y: 0};

            var img = new Image();
            // TODO: make sure the image is already loaded before rendering.
            img.src = imageSource;
            var object = {img: img, tags: tags, pos: pos, inertia: inertia};
            objects.push(object);
            objTags.forEach(function(tag) {
                if (tags[tag] === undefined) {
                    tags[tag] = [object];
                } else {
                    tags[tag].push(object);
                }
            });
        },

        start: function() {
            window.requestAnimationFrame(render);
            running = true;
        },

        stop: function() {
            running = false;
        }
    };
})();

var Mouse = {pos: {x: 0, y: 0}, inertia: {x: 0, y: 0}};
window.onmousemove = function(event) {
    Mouse.inertia.x = event.clientX - Mouse.pos.x;
    Mouse.inertia.y = event.clientY - Mouse.pos.y;

    Mouse.pos.x = event.clientX;
    Mouse.pos.y = event.clientY;
}

function move(target, speed) {
    gl4.register(target, function(object) {
        object.inertia.x = speed.x;
        object.inertia.y = speed.y;
    });
}

function push(target, acceleration) {
    gl4.register(target, function(object) {
        object.inertia.x += acceleration.x;
        object.inertia.y += acceleration.y;
    });
}

gl4.create('star.png', ['star']);
gl4.start();

canvas.onclick = function() {
    if (gl4.isRunning()) {
        gl4.stop();
    } else {
        gl4.start();
    }
}

push('star', {x: 0.1, y: 0.01})

