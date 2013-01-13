chrome.runtime.onInstalled.addListener(function() {
    log.debug("Installing background");

    log.debug("Clearing storage");
    chrome.storage.local.clear();
    /*
    $.indexedDB('mt').objectStore('hits').clear();
    $.indexedDB('mt').objectStore('hitStatusSummary').clear();
    */

    $.indexedDB('mt').objectStore('worker', true).put('Matt Wilson', 'userName');
    $.indexedDB('mt').objectStore('worker', true).put(null, 'lastBonus');

    log.debug("Installed background");
});

log.debug("Initializing background");

monitor(1, 'dashboardUpdate', dashboardUpdate);
monitor(5, 'accountUpdate',   accountUpdate);
monitor(1, 'statusUpdate',    statusUpdate);

var requestQueue = new Queue(0.015);

/*
var responseRoot = $(document.createElement("div"));
responseRoot.attr('id', 'response');
$(document.body).append(responseRoot);
*/



function monitor(period, name, callback) {
    log.debug('monitoring: ' + name);

    chrome.alarms.onAlarm.addListener(function(alarm) {
	if (alarm.name == name) {
	    callback(alarm);
	}
    });

    chrome.alarms.create(name, { delayInMinutes: 0.1, periodInMinutes: period });
}

function getURL(url, callback) {
    log.debug('Queueing ' + url);

    requestQueue.enqueue('https://www.mturk.com' + url, function(url) {
	log.debug('Fetching ' + url);

	var response = $('<div>');
	$.get(url).done(function(data) {
	    log.debug('Received ' + url);

	    response.html(data);

	    var loggedInUser = response.find('#user_name_field').text();

	    if (loggedInUser != 'Matt Wilson') {
		log.error('Error: Different user logged in');
	    } else {
		callback(response);
	    }
	});
    });
}

function checkHit(groupID) {
    getURL('/mturk/preview?groupID=' + groupID, function(response) {
	log.debug('searching for hit');
	var hit = response.find('iframe');
	if (hit) {
	    log.debug('hit exists: ' + groupID);
	} else {
	    log.debug('hit not found: ' + groupID);
	}
    });
}

function dashboardUpdate() {
    getURL('/mturk/dashboard', function(response) {
	var lastUpdated = $.now();

	var workerID = response.find('.orange_text_right').text().slice(16);
	$.indexedDB('mt').objectStore('worker', true).put(workerID, 'workerID');

	var curBonus = response.find('#bonus_earnings_amount').text();
	$.indexedDB('mt').objectStore('worker').get('lastBonus').done(function(r) {
	    var lastBonus = r;

	    if (curBonus != lastBonus) {
		$.indexedDB('mt').objectStore('worker', true).put(curBonus, 'lastBonus');
		$.indexedDB('mt').objectStore('bonuses', true).put({ 'bonus': curBonus, 'created': lastUpdated });
	    }
	});
    });
}

function accountUpdate() {
    getURL('/mturk/youraccount', function(response) {
	var accountBalance = response.find('#account_balance').text().trim();

	console.log(accountBalance);
	$.indexedDB('mt').objectStore('worker', true).put(accountBalance, 'accountBalance')
	 .always(function() {
		 console.log('accountbalance fired');
	 })
	 .fail(function() {
		 console.log('accountbalance failed');
	 })
         .done(function() {
		 console.log('accountbalance done');
	 });
    });
}

function statusUpdate() {
    getURL('/mturk/status', function(response) {
	response.find('table .greyBox tr.grayHead').remove();

	var currentStatuses = {};

	/* Parse the statuses for each day */
	response.find('table .greyBox tr').each(function(index, row) {
	    row = $(row);
	    if (row.hasClass('even') || row.hasClass('odd')) {
		var date, submitted, approved, rejected, pending;

		row.children().each(function(index, col) {
		    col = $(col);
		    if (col.hasClass('statusDateColumnValue')) {
			date = col.children()[0].href.split('=')[1];
		    } else if (col.hasClass('statusSubmittedColumnValue')) {
			submitted = col.text();
		    } else if (col.hasClass('statusApprovedColumnValue')) {
			approved = col.text();
		    } else if (col.hasClass('statusRejectedColumnValue')) {
			rejected = col.text();
		    } else if (col.hasClass('statusPendingColumnValue')) {
			pending = col.text();
		    }
		});

		var statusSummary = {
		    'submitted': submitted,
		    'approved':  approved,
		    'rejected':  rejected,
		    'pending':   pending
		};

		currentStatuses[date] = statusSummary;
	    }
	});

	/* 
	 * Compare the new hit status counts with the old ones to see which
	 * dates we need to update.
	 */
	$.each(currentStatuses, function(currentDate, currentStatus) {
	    $.indexedDB('mt').objectStore('hitStatusSummary').get(currentDate).done(function(previousStatus) {
		var currentStatus = currentStatuses[currentDate];

		/* XXX should only update summary when all hits from that date are successfully updated. */
		$.indexedDB('mt').objectStore('hitStatusSummary').put(currentStatus, currentDate);

		/* No previous data for this day, update everything for this day. */
		if (previousStatus == undefined) {
		    log.debug(currentDate + ' not found, updating');
		    updateHitsFrom(currentDate, currentStatus);
		/* Nothing changed for this day, do nothing */
		} else if (   currentStatus.submitted == previousStatus.submitted
		           && currentStatus.pending   == previousStatus.pending
		           && currentStatus.rejected  == previousStatus.rejected
		           && currentStatus.approved  == previousStatus.approved) {
		    log.debug('no change: ' + currentDate);
		/*
		 * New hits have been submitted but nothing has been approved
		 * or rejected since last check; only need to check the last
		 * status pages for this date to see the new pending his.
		 */
		} else if (   currentStatus.submitted >  previousStatus.submitted
		           && currentStatus.rejected  == previousStatus.rejected
		           && currentStatus.approved  == previousStatus.approved) {
		    var currentNumPages  = Math.ceil(currentStatus.submitted  / 25);
		    var previousNumPages = Math.ceil(previousStatus.submitted / 25);

		    for (var page = previousNumPages; page <= currentNumPages; page++) {
			log.debug('new hits: ' + currentDate + ' ' + page);
			// updateHitsPage(currentDate, page);
		    }
		}
		/*
		 * No new submissions, but pending hits have decreased; check
		 * only pages with pending hits for approvals or rejections.
		 */
		else if (   currentStatus.submitted == previousStatus.submitted
			 && currentStatus.pending   <  previousStatus.pending) {
		    /* XXX */
		    log.debug('pending down: ' + currentDate + ' ' + currentStatus);
		    //updateHitsFrom(currentDate, currentStatus);
		} else {
		    /* update everything */
		    log.debug('update everything: ' + currentDate + ' ' + currentStatus);
		    //updateHitsFrom(currentDate, currentStatus);
		}
	    }).fail(function(error, event) {
		log.error('get failed: ');
	    });
	});
    });
}

function updateHitsPage(date, page) {
    getURL('/mturk/statusdetail?sortType=All&encodedDate=' + date + '&pageNumber=' + page, function (response) {
	response.find('#dailyActivityTable tr[valign]').each(function(index, row) {
	    var hitID, requesterID, requester, title, reward, status, feedback;

	    $(row).children().each(function(index, col) {
		col = $(col);

		if (col.hasClass('statusdetailRequesterColumnValue')) {
		    requester = col.text().trim();

		    var urlParams = col.find('a').attr('href').split('?')[1].split('&');
		    hitID         = urlParams[0].split('=')[1].split('+')[5];
		    requesterID   = urlParams[1].split('=')[1];

		} else if (col.hasClass('statusdetailTitleColumnValue')) {
		    title = col.text();
		} else if (col.hasClass('statusdetailAmountColumnValue')) {
		    reward = col.text();
		} else if (col.hasClass('statusdetailStatusColumnValue')) {
		    status = col.text();
		} else if (col.hasClass('statusdetailRequesterFeedbackColumnValue')) {
		    feedback = col.text().trim();
		}
	    });

	    var hit = {
		'hitID':       hitID,
		'requesterID': requesterID,
		'requester':   requester,
		'date':        date,
		'page':        page,
		'title':       title,
		'reward':      reward,
		'status':      status,
		'feedback':    feedback
	    };

	    $.indexedDB('mt').objectStore('hits', true).put(hit, hitID);
	});
    });
}

function updateHitsFrom(date, status) {
    var pages = Math.ceil(status.submitted / 25);

    for (var page = 1; page <= pages; page++) {
	updateHitsPage(date, page);
    }
}

function totalPending() {
    var pending = 0;

    return $.indexedDB('mt').objectStore('hits').each(function(item) {
	var hit = item.value;

	if (hit.status == 'Pending Approval') {
	    pending += parseFloat(hit.reward.slice(1));
	}
    }).then(function() {
	return pending;
    });
}

function projectedEarnings(date) {
    var projected = 0;

    return $.indexedDB('mt').objectStore('hits').each(function(item) {
	var hit  = item.value;

	if (hit.date == date && hit.status != 'Rejected') {
	    projected += parseFloat(hit.reward.slice(1));
	}
    }).then(function() {
	return projected;
    });
}
