var Promise = require("bluebird");
var request = require('requestretry');
var crypto = require('crypto');
var querystring = require('querystring');
var Queue = require('promise-queue-rate-limited');

/**
 * KrakenClient connects to the Kraken.com API
 *
 * @param {String} key    API Key
 * @param {String} secret API Secret
 * @param {Number} [timeoutMillis]  Server response timeout in milliseconds (optional, default: 5000 ms)
 * @param {Number} [retryAttepms]  Retries after server connction errors
 * @param {Number} [retryDelayMillis]  Delay between retry attempts
 * @param {Number} [requestsPerSecond]  Requests per seconds. If specified and >= 0 then a rate-limited queue will be used internally to execute the requests. Of <= 0 then no queue will be used.
 * @param logger - An optional logger which has an info method to log the kraken-api requests
 */
function KrakenClient(key, secret, timeoutMillis, retryAttepms, retryDelayMillis, requestsPerSecond, logger) {
    var self = this;
    var nonce = new Date() * 1000; // spoof microsecond

    var config = {
        url: 'https://api.kraken.com',
        userAgent: 'Kraken Javascript API Client',
        version: '0',
        key: key,
        secret: secret,
        timeoutMS: timeoutMillis || 5000,
        maxRetryAttempts: retryAttepms || 5,
        retryDelayMillis: retryDelayMillis || 5000,
        requestsPerSecond: requestsPerSecond && requestsPerSecond > 0 ? requestsPerSecond : null
    };

    var queue = config.requestsPerSecond ? new Queue(config.requestsPerSecond) : null;
    if (queue) {
        queue.start();
    }

    /**
     * This method makes a public or private API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @return {Promise}            A promise which will resolve to the servers reponse
     */
    function api(method, params) {
        if (logger) {
            logger.info("kraken-api", {method: method, params: params});
        }

        var methods = {
            public: ['Time', 'Assets', 'AssetPairs', 'Ticker', 'Depth', 'Trades', 'Spread', 'OHLC'],
            private: ['Balance', 'TradeBalance', 'OpenOrders', 'ClosedOrders', 'QueryOrders', 'TradesHistory',
                'QueryTrades', 'OpenPositions', 'Ledgers', 'QueryLedgers', 'TradeVolume', 'AddOrder', 'CancelOrder',
                'DepositMethods', 'DepositAddresses', 'DepositStatus', 'WithdrawInfo', 'Withdraw', 'WithdrawStatus',
                'WithdrawCancel'],
            withoutRetry: ['AddOrder', 'CancelOrder', 'Withdraw', 'WithdrawCancel']
        };

        if (methods.public.indexOf(method) !== -1) {
            return publicMethod(method, params, true);
        } else if (methods.private.indexOf(method) !== -1) {
            return privateMethod(method, params, methods.withoutRetry.indexOf(method) == -1);
        }

        return Promise.reject(new Error(method + ' is not a valid API method.'));
    }

    /**
     * This method makes a public API request.
     * @param  {String}  method   The API method (public or private)
     * @param  {Object}  params   Arguments to pass to the api call
     * @param  {boolean} allowRetry - True if a retry of the command on network errors is allowed
     * @return {Promise} A promise which will resolve to the servers reponse
     */
    function publicMethod(method, params, allowRetry) {
        params = params || {};

        var path = '/' + config.version + '/public/' + method;
        var url = config.url + path;

        return rawRequest(url, {}, params, allowRetry ? null : function () {
            return false;
        });
    }

    /**
     * This method makes a private API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @param  {boolean}  allowRetry - True if a retry of the command on network errors is allowed
     * @return {Promise}  A promise which will resolve to the servers reponse
     */
    function privateMethod(method, params, allowRetry) {
        params = params || {};

        var path = '/' + config.version + '/private/' + method;
        var url = config.url + path;

        params.nonce = nonce++;

        var signature = getMessageSignature(path, params, params.nonce);

        var headers = {
            'API-Key': config.key,
            'API-Sign': signature
        };

        return rawRequest(url, headers, params, allowRetry ? null : function () {
            return false;
        });
    }

    /**
     * This method returns a signature for a request as a Base64-encoded string
     * @param  {String}  path    The relative URL path for the request
     * @param  {Object}  request The POST body
     * @param  {Number} nonce   A unique, incrementing integer
     * @return {String}          The request signature
     */
    function getMessageSignature(path, request, nonce) {
        var message = querystring.stringify(request);
        var secret = new Buffer(config.secret, 'base64');
        var hash = new crypto.createHash('sha256');
        var hmac = new crypto.createHmac('sha512', secret);

        var hash_digest = hash.update(nonce + message).digest('binary');
        return hmac.update(path + hash_digest, 'binary').digest('base64');
    }

    /**
     * This method sends the actual HTTP request
     * @param  {String}   url      The URL to make the request
     * @param  {Object}   headers  Request headers
     * @param  {Object}   params   POST body
     * @param {Function} retryStrategy - The optional retry strategy. Fallback is to retry on network errors.
     * @return {Promise} A promise which will resolve to the servers response.
     */
    function rawRequest(url, headers, params, retryStrategy) {
        function doRawRequest() {
            return new Promise(function (resolve, reject) {
                // Set custom User-Agent string
                headers['User-Agent'] = config.userAgent;

                var options = {
                    url: url,
                    method: 'POST',
                    headers: headers,
                    form: params,
                    timeout: config.timeoutMS,
                    // The below parameters are specific to request-retry
                    maxAttempts: config.maxRetryAttempts,
                    retryDelay: config.retryDelayMillis,
                    retryStrategy: retryStrategy || request.RetryStrategies.NetworkError // retry only on network erros, avoid possibly duplicate requests on http errors
                };

                request(options, function (error, response, body) {
                    if (error) {
                        reject(new Error('Error in server response: ' + JSON.stringify(error)));
                        return;
                    }

                    var data;
                    try {
                        data = JSON.parse(body);
                    }
                    catch (e) {
                        reject(new Error('Could not understand response from server.'));
                        return;
                    }

                    //If any errors occured, Kraken will give back an array with error strings under
                    //the key "error". We should then propagate back the error message as a proper error.
                    if (data.error && data.error.length) {
                        var krakenError = null;
                        data.error.forEach(function (element) {
                            if (element.charAt(0) === "E") {
                                krakenError = element.substr(1);
                                return false;
                            }
                        });
                        if (krakenError) {
                            reject(new Error('Kraken API returned error: ' + krakenError));
                        }
                    }
                    else {
                        if (logger && logger.silly) {
                            logger.silly("kraken-api", {url: url, data: data});
                        }

                        resolve(data.result, data);
                    }
                });
            });
        }

        if (queue) {
            return queue.append(() => {
                return doRawRequest();
            });
        }

        return doRawRequest();
    }

    self.api = api;
    self.publicMethod = publicMethod;
    self.privateMethod = privateMethod;
}

module.exports = KrakenClient;