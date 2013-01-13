function Queue(delay) {
    this._queue  = [];
    this._paused = true;
    this._delay  = delay;
}

Queue.prototype.enqueue = function(value, callback) {
    log.debug('Enqueueing ' + value);

    this._queue.push({ 'value': value, 'callback': callback });

    if (this._paused) {
	this.run();
    }
};

Queue.prototype.pause = function() {
    this._paused = true;

    // chrome.alarms.clear('queue');
};

Queue.prototype.run = function() {
    log.debug('Running queue');

    if (this._paused) {
	this._paused = false;

	this._process();
    }
};

Queue.prototype._process = function() {
    if (this._queue.length == 0) {
	this.pause();
	return;
    }

    var self = this;
    var item = this._queue.shift();

    var listener = function (alarm) {
	if (alarm.name == 'queue') {
	    log.debug('Processing item: ' + item.value);

	    item.callback(item.value);

	    chrome.alarms.onAlarm.removeListener(listener);
	    self._process();
	}
    };

    log.debug('Scheduling next item: ' + item.value);

    chrome.alarms.onAlarm.addListener(listener);
    chrome.alarms.create('queue', { delayInMinutes: this._delay });
};
