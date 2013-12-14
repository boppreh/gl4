function glow(color, size) {
    return function (context) {
        context.shadowColor = color;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = size;
    } 
}

function shadow(offsetX, offsetY, blur, color) {
    color = color === undefined ? 'black' : color;
    blur = blur === undefined ? 3 : blur;
    offsetX = offsetX === undefined ? 1 : offsetX;
    offsetY = offsetY === undefined ? 1 : offsetY;
    return function (context) {
        context.shadowColor = color;
        context.shadowOffsetX = offsetX;
        context.shadowOffsetY = offsetY;
        context.shadowBlur = blur;
    }
}
