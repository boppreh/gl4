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

    return gl4.register(function () {
        var result = condition(runBehaviors);
        // Allow conditions to return true instead of using the callback.
        if (result === true) {
            runBehaviors();
        }
    });
}

function mouseDown() {
    return function () {
        return gl4.mouse.isDown;
    };
}

function mouseUp() {
    return function () {
        return !gl4.mouse.isDown;
    };
}

function keyDown(key) {
    return function() {
        return gl4.isPressed(key);
    };
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
    };
}

function not(condition) {
    return function () {
        return !condition.apply(condition, arguments);
    }
}

function or(/*conditions*/) {
    var conditions = Array.prototype.slice.call(arguments, 0);
    return function () {
        var result = false;
        conditions.forEach(function (condition) {
            result = condition.apply(condition, arguments) || result;
        });
        return result;
    }
}
