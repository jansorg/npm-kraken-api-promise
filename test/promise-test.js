var test = require('tape');
var KrakenClient = require('../src/kraken-client-promise.js');

test("Calls pass the result data as the promise result", function (t) {
    t.plan(1);

    var kraken = new KrakenClient("wwf1jAmrQXgcGC1RRhwB3pB06I+4hbuXeXdmKPpwrMsOxj0TcbvCO9vd", "7preSfDP4hhgylYoman0SASYhcqxx+7u+n/vTpqa+PTvkcG7l28mDEU1KI0PLZx0/1wssyqHk9KNESldtk67bQ==");
    kraken.api("AssetPairs", {}).then(function (result) {
        //console.log("Server response: " + JSON.stringify(result));
        t.ok(result != null);
    }).error(function (error) {
        console.error("Errro: " + error);
    });

});

test("Calls pass the error if the promise failed", function (t) {
    t.plan(1);

    var kraken = new KrakenClient("wwf1jAmrQXgcGC1RRhwB3pB06I+4hbuXeXdmKPpwrMsOxj0TcbvCO9vd", "7preSfDP4hhgylYoman0SASYhcqxx+7u+n/vTpqa+PTvkcG7l28mDEU1KI0PLZx0/1wssyqHk9KNESldtk67bQ==");
    kraken.api("UnknownMethod", {}).catch((error) => {
        console.error("Errror: " + error);

        t.ok(error != null, "The error is passed in the catch.");
    });

});
