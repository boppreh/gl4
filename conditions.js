var MATCH_1 = [null];
var MATCH_2 = [null];
var MATCH_3 = [];

function on(condition, successBehaviors, failureBehaviors) {
    function parseBehaviors(behaviors) {
        if (behaviors === undefined) {
            return [];
        } else if (typeof behaviors === 'function') {
            return parseBehaviors([behaviors]);
        }

        for (var i in behaviors) {
            if (behaviors[i].id !== undefined) {
                // Stop the kernel from calling the behaviors automatically.
                gl4.unregister(behaviors[i]);
            }
        }

        return behaviors;
    }
    successBehaviors = parseBehaviors(successBehaviors);
    failureBehaviors = parseBehaviors(failureBehaviors);

    return gl4.register(function () {
        var result = condition();
        if (result.length) {
            result.forEach(function (match) {
                MATCH_1[0] = match[0];
                MATCH_2[0] = match[1];
                MATCH_3[0] = match[2];

                for (var i in successBehaviors) {
                    successBehaviors[i]();
                }
            });
        } else {
            for (var i in failureBehaviors) {
                failureBehaviors[i]();
            }
        }
    });
}

function mouseDown(objectTag) {
    objectTag = objectTag || 'screen';
    return function () {
        if (!gl4.mouse.isDown) {
            return [];
        }

        var matches = [];
        gl4.forEach(objectTag, function (object) {
            if (object.hitTest(gl4.mouse)) {
                matches.push([object]);
            }
        });
        return matches;
    };
}

function mouseUp() {
    return function () {
        if (gl4.mouse.isDown) {
            return [[]];
        } else {
            return [];
        }
    };
}

function keyDown(key) {
    return function() {
        if (gl4.pressedKeys[key]) {
            return [[]];
        } else {
            return [];
        }
    };
}

function hit(objectTag, targetTag) {
    return function() {
        var matches = [];
        gl4.forEach(objectTag, targetTag, function(object, target) {
            if (object.hitTest(target)) {
                matches.push([object, target]);
            }
        });
        return matches;
    };
}

function distance(objectTag, targetTag, maxDistance) {
    return function() {
        var matches = [];
        gl4.forEach(objectTag, targetTag, function(object, target) {
            var difX = target.pos.x - object.pos.x,
                difY = target.pos.y - object.pos.y,
                distance = Math.sqrt(difX * difX + difY * difY);

            if (distance > maxDistance) {
                matches.push([object, target]);
            }
        });
        return matches
    };
}

function not(condition) {
    return function () {
        return condition().length === 0;
    }
}

function or(/*conditions*/) {
    var conditions = Array.prototype.slice.call(arguments, 0);
    return function () {
        var matches = [];
        conditions.forEach(function (condition) {
            condition().forEach(function (match) {
                matches.push(match);
            });
        });
        return matches;
    }
}

function pulse(frequency, source, startAsTrue) {
    frequency = frequency || 1;
    source = source === undefined ? [gl4.mouse] : source;
    startAsTrue = startAsTrue === undefined ? true : startAsTrue;

    var interval = 1 / frequency,
        initialTimeAdded = startAsTrue ? 0 : interval,
        nextPulseTimeBySource = {};

    return function () {
        var matches = [];
        gl4.forEach(source, function (object) {
            if (!nextPulseTimeBySource[object.id]) {
                nextPulseTimeBySource[object.id] = gl4.seconds + initialTimeAdded;
            }

            while (nextPulseTimeBySource[object.id] <= gl4.seconds) {
                nextPulseTimeBySource[object.id] += interval;
                matches.push([object]);
            }
        });
        return matches;
    }
}

function up(condition) {
    var pastValues = {};
    var pastResult = false;

    return function() {
        var matches = [];
        var returned = condition();

        returned.forEach(function (match) {
            var ids = [];
            for (var i in match) {
                ids.push(match[i].id);
            }
            var key = String(ids);
            if (!pastValues[key]) {
                matches.push(match);
            }
            pastValues[key] = true;
            pastValuesUsed[key] = true;
        });

        for (var key in pastValues) {
            if (pastValuesUsed[key] === undefined) {
                pastValues[key] = false;
            }
        }

        return matches;
    }
}
