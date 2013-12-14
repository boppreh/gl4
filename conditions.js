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

function mouseDown(objectTag) {
    objectTag = objectTag || 'screen';
    return function (callback) {
        if (!gl4.mouse.isDown) {
            return;
        }

        gl4.forEach(objectTag, function (object) {
            if (object.hitTest(gl4.mouse)) {
                callback(object);
            }
        });
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
            if (object.hitTest(target)) {
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
    return function (callback) {
        var result = false;
        conditions.forEach(function (condition) {
            result = condition(callback) || result;
        });
        return result;
    }
}

function pulse(frequency, source, startAsTrue) {
    frequency = frequency || 1;
    source = source === undefined ? [gl4.mouse] : source;
    startAsTrue = startAsTrue === undefined ? true : startAsTrue;

    var interval = 1 / frequency,
        initialTimeAdded = startAsTrue ? 0 : interval,
        nextPulseTimeBySource = {};

    return function (callback) {
        gl4.forEach(source, function (object) {
            var nextPulseTime = nextPulseTimeBySource[object.id],
                time = gl4.seconds();

            if (!nextPulseTime) {
                nextPulseTime = time + initialTimeAdded
                nextPulseTimeBySource[object.id] = nextPulseTime;
            }

            if (nextPulseTime <= time) {
                nextPulseTimeBySource[object.id] = time + interval;
                callback(object);
            }
        });
    }
}
