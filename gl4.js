"use strict";

var gl4 = (function() {
    var canvas = document.getElementById("canvas");
    var context = canvas.getContext("2d");

    var objects = []
    var tags = {}
    var frameId = -1;

    canvas.onclick = function() {
        if (intervalId === -1) {
            start();
        } else {
            stop();
        }
    }

    function render() {
        if (frameId === -1) {
            return;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        objects.forEach(function(object) {
            context.drawImage(object.img, object.x, object.y);
        });

        frameId = window.requestAnimationFrame(render);
    }

    return {
        create: function(imageSource, x, y, tags) {
            var img = new Image();
            // TODO: make sure the image is already loaded before rendering.
            img.src = imageSource;
            var object = {img: img, x: x, y: y, tags: tags};
            objects.push(object);
            tags.forEach(function(tag) {
                tags[tag].push(object);
            });
        },

        start: function() {
            frameId = window.requestAnimationFrame(render);
        },

        stop: function() {
            window.clearInterval(intervalId);
            frameId = -1;
        }
    };
})();

gl4.create('star.png', 0, 0, []);
gl4.start();
