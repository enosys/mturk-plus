var log = {};

log.level = function(level, object) {
    chrome.storage.local.get('levels', function(item) {
	var levels = item.levels;

	/* Not in storage yet, initialize */
	if (levels == undefined) {
	    levels = {
		debug: [],
		error: [],
		info:  []
	    };
	}

	var queue = levels[level];
	queue.push({ 'message': object, 'date': $.now() });

	var unreadCount = queue.length;
	chrome.browserAction.setBadgeText({ text: String(unreadCount) });

	console.log(level + ': ', object);

	chrome.storage.local.set({ 'levels': levels });
    });
}

log.debug = function(object) {
    return log.level('debug', object);
}

log.error = function(object) {
    return log.level('error', object);
}

log.info = function(object) {
    return log.level('info', object);
}
