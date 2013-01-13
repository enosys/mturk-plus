console.log('dashboard init');

var approvedSelector = "body > table:eq(5) > tbody > tr:eq(1) > td > table > tbody > tr > td:eq(1) > table > tbody > tr:eq(2) > td:eq(1)";
var rejectedSelector = "body > table:eq(5) > tbody > tr:eq(1) > td > table > tbody > tr > td:eq(1) > table > tbody > tr:eq(3) > td:eq(1)";
var pendingSelector  = "body > table:eq(5) > tbody > tr:eq(1) > td > table > tbody > tr > td:eq(1) > table > tbody > tr:eq(4) > td:eq(1)";

var approvalRateSelector = "body > table:eq(5) > tbody > tr:eq(1) > td > table > tbody > tr > td:eq(1) > table > tbody > tr:eq(2) > td:eq(2)";

var responseRoot = $(document.createElement("div"));
responseRoot.attr('id', 'response');
responseRoot.css('display', 'none');
$('body').append(responseRoot);

var approved = parseInt($(approvedSelector).text());
var rejected = parseInt($(rejectedSelector).text());
var pending  = parseInt($(pendingSelector).text());

var approvalRate = 100 - rejected / approved;

$(approvalRateSelector).text(approvalRate.toFixed(4) + '%');
