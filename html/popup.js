$(document).ready(function() {
    $.indexedDB('mt').objectStore('worker').get('workerID').done(function(r) {
	$('#workerID').text(r);
    });

    $.indexedDB('mt').objectStore('worker').get('accountBalance').done(function(r) {
	$('#accountBalance').text(r);
    });

    $.indexedDB('mt').objectStore('hitStatusSummary').each(function(item) {
	var date = item.key;
	var hits = item.value;
	log.warning(date + ": " + hits.pending);
    });
});
