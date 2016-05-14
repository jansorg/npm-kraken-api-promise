const Promise = require("bluebird");

/**
 *
 * @param {number} maxPoints
 * @param {number} reductionIntervalMillis
 * @param {number} reductionPerInverval
 * @param logger
 * @constructor
 */
function WeightedPromiseQueue(maxPoints, reductionIntervalMillis, reductionPerInverval, logger) {
    this.maxPoints = maxPoints;
    this.reductionInterval = reductionIntervalMillis;
    this.reductionPerInterval = reductionPerInverval;
    this.watcherInterval = 2000;
    this.logger = logger;

    this.points = 0;
    this.reductionIntervald = null;
    this.watcherTimeoutId = null;
    this.running = false;
    this.queue = [];
}

WeightedPromiseQueue.prototype.start = function () {
    if (!this.running) {
        this.running = true;

        if (this.logger && this.logger.debug) {
            this.logger.debug("WeightedPromiseQueue: start()");
        }

        const self = this;
        this.reductionIntervald = setInterval(function () {
            let newValue = Math.max(0, self.points - self.reductionPerInterval);

            if (self.logger && self.logger.debug) {
                self.logger.debug("Decreasing points", {
                    current: self.points,
                    new: newValue
                });
            }

            self.points = newValue;
        }, this.reductionInterval);

        setImmediate(() => self.intervalTick());
    }
};

WeightedPromiseQueue.prototype.stop = function () {
    if (this.running) {
        this.running = false;

        if (this.logger && this.logger.debug) {
            this.logger.debug("WeightedPromiseQueue: start()");
        }

        if (this.reductionIntervald) {
            clearInterval(this.reductionIntervald);
            this.reductionIntervald = null;
        }

        if (this.watcherTimeoutId) {
            clearTimeout(this.reductionIntervald);
            this.reductionIntervald = null;
        }
    }
};

WeightedPromiseQueue.prototype.intervalTick = function () {
    var available = this.maxPoints - this.points;
    if (this.logger && this.logger.debug) {
        this.logger.debug("WeightedPromiseQueue: intervalTick()", {points: this.points, available: available});
    }

    if (this.queue.length > 0 && available >= this.queue[0].cost) {
        const next = this.queue.shift();
        this.points += next.cost;

        if (this.logger && this.logger.debug) {
            this.logger.debug("Resolving item with cost", {cost: next.cost, nowAvailable: available - next.cost});
        }

        next.resolveFn();
    }

    var self = this;
    this.watcherTimeoutId = setTimeout(function () {
        self.intervalTick();
    }, this.watcherInterval);
};

/**
 * Retunrns a promise as soon as the operation is possible.
 * @param cost
 * @return {Promise}
 */
WeightedPromiseQueue.prototype.waitFor = function (cost) {
    if (this.logger && this.logger.debug) {
        this.logger.debug("WeightedPromiseQueue: waitFor()", cost);
    }

    var resolveFn = null;
    var rejectFn = null;

    var promise = new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
    });

    if (this.logger && this.logger.debug) {
        this.logger.debug("Queuing new item", {cost: cost});
    }

    this.queue.push({
        cost: cost,
        resolveFn: resolveFn,
        rejectFn: rejectFn
    });

    return promise;
};

module.exports = WeightedPromiseQueue;