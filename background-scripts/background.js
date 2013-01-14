// vim: sts:sw=4

chrome.runtime.onInstalled.addListener(function() {
    log.debug("Installing background");

    log.debug("Clearing local storage");
    chrome.storage.local.clear();

    log.debug("Installed background");
});

log.debug("Initializing background");

var requestQueue = new Queue(0.015);

log.debug("Opening database");
var db = openDatabase('mt', '1.0', 'MTurk Plus database', 50 * 1024 * 1024);
db.transaction(function (tx) {
    tx.executeSql('CREATE TABLE IF NOT EXISTS hitStatusSummary (date TEXT PRIMARY KEY, submitted INTEGER, approved INTEGER, rejected INTEGER, pending INTEGER)');
    tx.executeSql('CREATE TABLE IF NOT EXISTS hits (hitID TEXT PRIMARY KEY, requesterID TEXT, requester TEXT, title TEXT, reward REAL, status TEXT, feedback TEXT, date TEXT, page INTEGER)');
});

/*
monitor(1, 'dashboardUpdate', dashboardUpdate);
monitor(5, 'accountUpdate',   accountUpdate);
monitor(1, 'statusUpdate',    statusUpdate);
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

function getURL(url) {
    // log.debug('Queueing ' + url);

    var deferred = $.Deferred();

    requestQueue.enqueue('https://www.mturk.com' + url, function(url) {
	// log.debug('Fetching ' + url);

	var response = $('<div>');
	$.ajax({
	    'url':     url,
	    'timeout': 20000
	 })
	 .fail(function (jqXHR, textStatus, errorThrown) {
	     log.error(url + ': ' + errorThrown);
	     deferred.reject('User not logged in');
	 })
	 .done(function (data) {
	    // log.debug('Received ' + url);

	    response.html(data);
	    response.remove('img').remove('script');

	    var loggedInUser = response.find('#user_name_field').text();

	    // XXX
	    if (loggedInUser != 'Matt Wilson') {
		log.error('Error: User not logged in');
		deferred.reject('User not logged in');
	    } else {
		deferred.resolve(response);
	    }
	});
    });

    return deferred.promise();
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

function parseDashboardPage(page) {
    var parseUSD = function (selector) {
	var usd = page.find(selector).text();
	return parseFloat(usd.slice(1));
    };

    var bonuses          = parseUSD('#bonus_earnings_amount');
    var approvedEarnings = parseUSD('#approved_hits_earnings_amount');
    var totalEarnings    = parseUSD('#total_earnings_amount');

    var hitMetrics = page.find('> table:eq(5) .metrics-table > tbody > tr');

    var hits = {};
    var acceptedHitsTable = hitMetrics.find('> td:eq(0)');
    hits.accepted  = parseInt(acceptedHitsTable.find('tr:eq(1) td:eq(1)').text());
    hits.submitted = parseInt(acceptedHitsTable.find('tr:eq(2) td:eq(1)').text());
    hits.returned  = parseInt(acceptedHitsTable.find('tr:eq(3) td:eq(1)').text());
    hits.abandoned = parseInt(acceptedHitsTable.find('tr:eq(4) td:eq(1)').text());

    var submittedHitsTable = hitMetrics.find('> td:eq(1)');
    hits.approved = parseInt(submittedHitsTable.find('tr:eq(2) td:eq(1)').text());
    hits.rejected = parseInt(submittedHitsTable.find('tr:eq(3) td:eq(1)').text());
    hits.pending  = parseInt(submittedHitsTable.find('tr:eq(4) td:eq(1)').text());

    var workerID = page.find('.orange_text_right').text().slice(16);

    return {
	'workerID': workerID,
	'hits':     hits,
	'earnings': {
	    'bonuses':  bonuses,
	    'approved': approvedEarnings,
	    'total':    totalEarnings
	}
    };
}

function dashboardUpdate() {
    return getURL('/mturk/dashboard').then(function(page) {
	var dashboardPage = parseDashboardPage(page);
	return dashboardPage;
    });
}

function parseAccountPage(page) {
    var accountPage = {};

    accountPage.balance = page.find('#account_balance').text().trim();

    return accountPage;
}

function accountUpdate() {
    return getURL('/mturk/youraccount').then(function (page) {
	var accountPage = parseAccountPage(page);
	return accountPage;
    });
}

function parseStatusPage(page) {
    page.find('table .greyBox tr.grayHead').remove();

    var statuses = [];
    page.find('table .greyBox tr').each(function(index, row) {
	row = $(row);

	var status       = {};
	status.date      = row.find('.statusDateColumnValue a')[0].href.split('=')[1];
	status.submitted = parseInt(row.find('.statusSubmittedColumnValue').text());
	status.approved  = parseInt(row.find('.statusApprovedColumnValue').text());
	status.rejected  = parseInt(row.find('.statusRejectedColumnValue').text());
	status.pending   = parseInt(row.find('.statusPendingColumnValue').text());
	status.earnings  = parseFloat(row.find('.statusEarningsColumnValue').text().slice(1));

	statuses.push(status);
    });

    return statuses;
}

function statusUpdate() {
    return getURL('/mturk/status').then(function (page) {
	var currentStatuses = parseStatusPage(page);

	/* 
	 * Compare the new hit status counts with the old ones to see which
	 * dates we need to update.
	 */
	$.each(currentStatuses, function(index, currentStatus) {
	    db.transaction(function (tx) {
		tx.executeSql('SELECT * FROM hitStatusSummary WHERE date = ?', [currentStatus.date], function (tx, results) {
		    /* XXX only update on successful update of all hits as well */
		    tx.executeSql('INSERT OR REPLACE INTO hitStatusSummary (date, submitted, approved, rejected, pending) ' +
			          'VALUES (?, ?, ?, ?, ?)', [currentStatus.date, currentStatus.submitted, currentStatus.approved, currentStatus.rejected, currentStatus.pending],
				  function (tx, results) {},
				  function (tx, error) { console.log('insert hitstatussummary error', error); });

		    /* No previous data for this day, update everything for this day. */
		    if (results.rows.length == 0) {
			log.debug(currentStatus.date + ' not found, updating');
			updateHitsFrom(currentStatus.date, currentStatus);
			return;
		    }

		    var previousStatus = results.rows.item(0);
		    /* Nothing changed for this day, do nothing */

		    if (   currentStatus.submitted == previousStatus.submitted
			&& currentStatus.pending   == previousStatus.pending
			&& currentStatus.rejected  == previousStatus.rejected
			&& currentStatus.approved  == previousStatus.approved) {
			log.debug('no change: ' + currentStatus.date);
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
			    log.debug('new hits: ' + currentStatus.date + ' ' + page);
			    updateHitsPage(currentStatus.date, page);
			}
		    }
		    /*
		     * No new submissions, but pending hits have decreased; check
		     * only pages with pending hits for approvals or rejections.
		     */
		    else if (   currentStatus.submitted == previousStatus.submitted
			     && currentStatus.pending   <  previousStatus.pending) {
			/* XXX */
			log.debug('pending down: ' + currentStatus.date + ' ' + currentStatus);
			updateHitsFrom(currentStatus.date, currentStatus);
		    } else {
			/* update everything */
			log.debug('update everything: ' + currentStatus.date + ' ' + currentStatus);
			updateHitsFrom(currentStatus.date, currentStatus);
		    }
		});
	    });
	});
    });
}

function parseHitsPage(page) {
    var hits = [];

    page.find('#dailyActivityTable tr[valign]').each(function(index, row) {
	row = $(row);

	var hit = {};

	hit.title    = row.find('.statusdetailTitleColumnValue').text().trim();
	hit.status   = row.find('.statusdetailStatusColumnValue').text().trim();
	hit.feedback = row.find('.statusdetailRequesterFeedbackColumnValue').text().trim();
	hit.reward   = parseFloat(row.find('.statusdetailAmountColumnValue').text().slice(1));

	requesterElement = row.find('.statusdetailRequesterColumnValue');

	var urlParams   = requesterElement.find('a').attr('href').split('?')[1].split('&');
	hit.hitID       = urlParams[0].split('=')[1].split('+')[5];
	hit.requesterID = urlParams[1].split('=')[1];
	hit.requester   = requesterElement.text().trim();

	hits.push(hit);
    });

    return hits;
}

function updateHitsPage(date, page) {
    return getURL('/mturk/statusdetail?sortType=All&encodedDate=' + date + '&pageNumber=' + page).then(function (page) {
	var hits = parseHitsPage(page);

	$.each(hits, function (index, hit) {
	    sql('INSERT OR REPLACE INTO hits (hitID, requesterID, requester, title, reward, status, feedback, date, page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[hit.hitID, hit.requesterID, hit.requester, hit.title, hit.reward, hit.status, hit.feedback, hit.date, hit.page]);
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
    return sql('SELECT SUM(reward) FROM hits WHERE status = "Pending Approval"').then(function (rows) {
	var row = rows.item(0);
	var reward = row['SUM(reward)'];

	return reward;
    });
}

function projectedEarnings(date) {
    return sql('SELECT SUM(reward) FROM hits WHERE date = ? AND status != "Rejected"', [date]).then(function (rows) {
	var row = rows.item(0);
	var reward = row['SUM(reward)'];

	return reward;
    });
}

function sql(statement, sqlArguments) {
    var deferred = $.Deferred();

    if (sqlArguments == undefined) { sqlArguments = []; }

    db.transaction(function (tx) {
	var success = function (tx, resultSet) {
	    deferred.resolve(resultSet.rows);
	};

	var failure = function (tx, error) {
	    deferred.reject(error);
	}

	tx.executeSql(statement, sqlArguments, success, failure);
    }, function (tx) {
	deferred.reject(error);
    });

    deferred.fail(log.error);

    return deferred.promise();
}
