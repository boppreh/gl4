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
            object.move(object.inertia);

            context.save();
            context.translate(object.pos.x, object.pos.y);
            context.rotate(object.pos.angle);
            context.drawImage(object.img, -object.size.width / 2, -object.size.height / 2);
            context.restore();
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
            pos = pos || {x: 0, y: 0, angle: 0};
            inertia = inertia || {x: 0, y: 0, angle: 0};

            var img = new Image();
            // TODO: make sure the image is already loaded before rendering.
            img.src = imageSource;
            var size = {width: img.width, height: img.height}

            var object = {img: img,
                          tags: tags,
                          pos: pos,
                          inertia: inertia,
                          size: size,
            
                          move: function(speed) {
                              this.pos.x += speed.x || 0;
                              this.pos.y += speed.y || 0;
                              this.pos.angle += speed.angle || 0;
                          },
            
                          push: function(acceleration) {
                              this.inertia.x += acceleration.x || 0;
                              this.inertia.y += acceleration.y || 0;
                              this.inertia.angle += acceleration.angle || 0;
                          }};

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

var Mouse = (function() {
    var obj = {pos: {x: 0, y: 0, angle: 0}, inertia: {x: 0, y: 0, angle: 0}};
    window.onmousemove = function(event) {
        obj.inertia.x = event.clientX - obj.pos.x;
        obj.inertia.y = event.clientY - obj.pos.y;

        obj.pos.x = event.clientX;
        obj.pos.y = event.clientY;
    }
    return obj;
})();

function move(target, speed) {
    gl4.register(target, function(object) {
        object.move(speed);
    });
}

function push(target, acceleration) {
    gl4.register(target, function(object) {
        object.push(acceleration);
    });
}

gl4.start();
