var Queue = require("../src/weightedPromiseQueue.js");

var queue = new Queue(2, 1000, 2, console);
queue.start();

for (var i = 0; i < 10; i++) {
    let index = i;
    queue.waitFor(1).then(()=> {
        console.warn("2 points were consumed: " + index);
    });
}

setTimeout(()=> {
    queue.stop();
}, 20000);