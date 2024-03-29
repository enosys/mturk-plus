$(document).ready(function() {
    console.log('popup.js');

    $.indexedDB('mt').objectStore('worker').get('workerID').done(function(r) {
	console.log('id: ', r);
	$('#workerID').text(r);
    });

    $.indexedDB('mt').objectStore('worker').get('accountBalance').done(function(r) {
	console.log('balance: ', r);
	$('#accountBalance').text(r);
    });

    $.indexedDB('mt').objectStore('hitStatusSummary').each(function(item) {
	var date = item.key;
	var hits = item.value;
	log.warning(date + ": " + hits.pending);
    });

    console.log('popup.js done');
});
