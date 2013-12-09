"use strict";

var gl4 = (function () {
    var FRAME_TIME_FILTER = 10,
        MOTION_BLUR_STRENGTH = 0.8;

    var canvas = document.getElementById("canvas"),
        context = canvas.getContext("2d"),
        running = false,
        objects = [],
        mouse = {pos: {x: 0, y: 0, angle: 0}, inertia: {x: 0, y: 0, angle: 0}},
        tags = {"mouse": [mouse]},
        behaviors = [],
        nLoading = 0,
        frameTime = 0,
        lastLoop = new Date,
        fps = 0,
        debug = false;

    function updateFps() {
        var currentLoop = new Date;
        var timeDif = currentLoop - lastLoop;
        lastLoop = currentLoop;
        frameTime += (timeDif - frameTime) / FRAME_TIME_FILTER;
        fps = (1000 / frameTime).toFixed(1);
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
            context.font = "bold 16px Verdana"
            context.fillText(fps + " fps", 10, 20);
        }

        window.requestAnimationFrame(run);
    }

    function runBehavior(behavior) {
        var tagged = tags[behavior.tags[0]];

        if (behavior.tags.length === 1) {
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

    function step() {
        var canvasData = context.getImageData(0, 0, canvas.width, canvas.height),
            n = canvasData.data.length / 4,
            motionBlurDif = 255 * (1 - MOTION_BLUR_STRENGTH);

        for (var i = 0; i < n; i++) {
            canvasData.data[i * 4 + 0] += motionBlurDif;
            canvasData.data[i * 4 + 1] += motionBlurDif;
            canvasData.data[i * 4 + 2] += motionBlurDif;
        }
        context.putImageData(canvasData, 0, 0);

        objects.forEach(function (object) {
            object.move(object.inertia);
            object.inertia.x *= (1 - object.friction.x);
            object.inertia.y *= (1 - object.friction.y);
            object.inertia.angle *= (1 - object.friction.angle);

            context.save();
            context.translate(object.pos.x, object.pos.y);
            context.rotate(object.pos.angle);
            context.drawImage(object.img, -object.size.width / 2, -object.size.height / 2);
            context.restore();
        });

        behaviors.forEach(runBehavior);
    }

    window.onmousemove = function (event) {
        mouse.inertia.x = event.clientX - mouse.pos.x;
        mouse.inertia.y = event.clientY - mouse.pos.y;

        mouse.pos.x = event.clientX;
        mouse.pos.y = event.clientY;
    };

    return {
        getFps: function () {
            return fps;
        },

        isRunning: function () {
            return running;
        },

        tagged: function (tag) {
            return tags[tag] || [];
        },

        register: function (tags, func) {
            if (tags.length !== 1 && tags.length !== 2) {
                console.error("Behavior must have exactly one or two declared tags.", tags);
            }
            behaviors.push({tags: tags, func: func});
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
                obj.size = {width: obj.img.width, height: obj.img.height}
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
            debug = debugMode || false;

            window.requestAnimationFrame(run);
            running = true;
        },

        stop: function () {
            running = false;
        }
    };
}());

function move(target, speed) {
    gl4.register([target], function (object) {
        object.move(speed);
    });
}

function push(target, acceleration) {
    gl4.register([target], function (object) {
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

    gl4.register([objTag, targetTag], function (object, target) {
        var difX = target.pos.x - object.pos.x,
            difY = target.pos.y - object.pos.y;

        if (difX * difX + difY * difY <= maxTolerableDistance) {
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

gl4.start(true);