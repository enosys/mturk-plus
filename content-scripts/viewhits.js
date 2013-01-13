var hitGroups = $('body > div > table:nth-child(3) > tbody > tr');

hitGroups.each(function(index, hitGroup) {
	var requester = $(hitGroup).find('a[href^="/mturk/searchbar?selectedSearchType=hitgroups"]').text().trim();
	var reward    = $(hitGroup).find('.reward').text();
	var hitTitle  = $(hitGroup).find('a.capsulelink[id^="capsule"]').text().trim();
	var hitURL    = 'https://www.mturk.com/mturk/searchbar?searchWords=' + hitTitle;

	var qualifications = [];
	var qualificationsElement = $(hitGroup).find('.capsuletarget > table:nth-child(2) table tr > td:nth-child(1)');
	qualificationsElement.each(function(index, qual) {
		var qualification = $(qual).text().trim().replace(/\s+/g, ' ');
		qualifications.push(qualification);
	});

	var quals = parseQualifications(qualifications);

	var title      = [quals.location, hitTitle, requester, reward + '/XXX', quals.rest].join(' - ');
	var adflyURL   = 'http://adf.ly/1191630/' + hitURL;
	var body       = '[' + hitTitle + '](' + encodeURI(adflyURL) + ')';
	var redditLink = 'http://www.reddit.com/r/HITsWorthTurkingFor/submit?title=' + encodeURI(title) + '&text=' + encodeURI(body);

	var previewLink = $(hitGroup).find('.capsulelink > a[href^="/mturk/preview"]');
	previewLink.parent().after('<span class="capsulelink"><a target="_blank" href="' + redditLink + '">Post to Reddit</a></span>');
});

function parseQualifications(qualifications) {
	var quals = {
		location: 'ICA',
		rest: ''
	};

	var qualList = [];
	for (var i = 0; i < qualifications.length; i++) {
		var qualification = qualifications[i];

		if (qualification.match(/Location is US/)) {
			quals.location = 'US';
		} else if (qualification.match(/HIT approval rate/)) {
			var approvalRate = parseComparison(qualification);
			qualList.push(approvalRate + '%');
		} else if (qualification.match(/Total approved HITs/)) {
			qualList.push(parseComparison(qualification));
		}
	}

	quals.rest = qualList.join(', ');

	return quals;
}

function parseComparison(qualification) {
	var value = '';

	if (qualification.match(/is not less than/)) {
		value += '>=';
	} else if (qualification.match(/is less than/)) {
		value += '<';
	} else if (qualification.match(/is not greater than/)) {
		value += '<=';
	} else if (qualification.match(/is greater than/)) {
		value += '>';
	}

	value += qualification.match(/\d+/)[0];

	return value;
}
