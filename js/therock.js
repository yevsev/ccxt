'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError, ArgumentsRequired, NotSupported, NetworkError } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class therock extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'therock',
            'name': 'TheRockTrading',
            'countries': [ 'MT' ],
            'rateLimit': 1000,
            'version': 'v1',
            'has': {
                'CORS': false,
                'fetchTickers': true,
                'fetchMyTrades': true,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27766869-75057fa2-5ee9-11e7-9a6f-13e641fa4707.jpg',
                'api': 'https://api.therocktrading.com',
                'www': 'https://therocktrading.com',
                'doc': [
                    'https://api.therocktrading.com/doc/v1/index.html',
                    'https://api.therocktrading.com/doc/',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        'funds',
                        'funds/{id}/orderbook',
                        'funds/{id}/ticker',
                        'funds/{id}/trades',
                        'funds/tickers',
                    ],
                },
                'private': {
                    'get': [
                        'balances',
                        'balances/{id}',
                        'discounts',
                        'discounts/{id}',
                        'funds',
                        'funds/{id}',
                        'funds/{id}/trades',
                        'funds/{fund_id}/orders',
                        'funds/{fund_id}/orders/{id}',
                        'funds/{fund_id}/position_balances',
                        'funds/{fund_id}/positions',
                        'funds/{fund_id}/positions/{id}',
                        'transactions',
                        'transactions/{id}',
                        'withdraw_limits/{id}',
                        'withdraw_limits',
                    ],
                    'post': [
                        'atms/withdraw',
                        'funds/{fund_id}/orders',
                    ],
                    'delete': [
                        'funds/{fund_id}/orders/{id}',
                        'funds/{fund_id}/orders/remove_all',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'maker': 0.2 / 100,
                    'taker': 0.2 / 100,
                },
                'funding': {
                    'tierBased': false,
                    'percentage': false,
                    'withdraw': {
                        'BTC': 0.0005,
                        'BCH': 0.0005,
                        'PPC': 0.02,
                        'ETH': 0.001,
                        'ZEC': 0.001,
                        'LTC': 0.002,
                        'EUR': 2.5,  // worst-case scenario: https://therocktrading.com/en/pages/fees
                    },
                    'deposit': {
                        'BTC': 0,
                        'BCH': 0,
                        'PPC': 0,
                        'ETH': 0,
                        'ZEC': 0,
                        'LTC': 0,
                        'EUR': 0,
                    },
                },
            },
            'wsconf': {
                'conx-tpls': {
                    'default': {
                        'type': 'pusher',
                        'baseurl': 'wss://ws-mt1.pusher.com/app/bb1fafdf79a00453b5af',
                    },
                },
                'methodmap': {
                    '_websocketTimeoutRemoveNonce': '_websocketTimeoutRemoveNonce',
                },
                'events': {
                    'ob': {
                        'conx-tpl': 'default',
                        'conx-param': {
                            'url': '{baseurl}',
                            'id': '{id}',
                        },
                    },
                },
            },
        });
    }

    async fetchMarkets (params = {}) {
        let response = await this.publicGetFunds ();
        //
        //     { funds: [ {                      id:   "BTCEUR",
        //                              description:   "Trade Bitcoin with Euro",
        //                                     type:   "currency",
        //                            base_currency:   "EUR",
        //                           trade_currency:   "BTC",
        //                                  buy_fee:    0.2,
        //                                 sell_fee:    0.2,
        //                      minimum_price_offer:    0.01,
        //                   minimum_quantity_offer:    0.0005,
        //                   base_currency_decimals:    2,
        //                  trade_currency_decimals:    4,
        //                                leverages: []                           },
        //                {                      id:   "LTCEUR",
        //                              description:   "Trade Litecoin with Euro",
        //                                     type:   "currency",
        //                            base_currency:   "EUR",
        //                           trade_currency:   "LTC",
        //                                  buy_fee:    0.2,
        //                                 sell_fee:    0.2,
        //                      minimum_price_offer:    0.01,
        //                   minimum_quantity_offer:    0.01,
        //                   base_currency_decimals:    2,
        //                  trade_currency_decimals:    2,
        //                                leverages: []                            } ] }
        //
        let markets = this.safeValue (response, 'funds');
        let result = [];
        if (markets === undefined) {
            throw new ExchangeError (this.id + ' fetchMarkets got an unexpected response');
        } else {
            for (let i = 0; i < markets.length; i++) {
                let market = markets[i];
                let id = this.safeString (market, 'id');
                let baseId = this.safeString (market, 'trade_currency');
                let quoteId = this.safeString (market, 'base_currency');
                let base = this.commonCurrencyCode (baseId);
                let quote = this.commonCurrencyCode (quoteId);
                let symbol = base + '/' + quote;
                let buy_fee = this.safeFloat (market, 'buy_fee');
                let sell_fee = this.safeFloat (market, 'sell_fee');
                let taker = Math.max (buy_fee, sell_fee);
                taker = taker / 100;
                let maker = taker;
                result.push ({
                    'id': id,
                    'symbol': symbol,
                    'base': base,
                    'quote': quote,
                    'baseId': baseId,
                    'quoteId': quoteId,
                    'info': market,
                    'active': true,
                    'maker': maker,
                    'taker': taker,
                    'precision': {
                        'amount': this.safeInteger (market, 'trade_currency_decimals'),
                        'price': this.safeInteger (market, 'base_currency_decimals'),
                    },
                    'limits': {
                        'amount': {
                            'min': this.safeFloat (market, 'minimum_quantity_offer'),
                            'max': undefined,
                        },
                        'price': {
                            'min': this.safeFloat (market, 'minimum_price_offer'),
                            'max': undefined,
                        },
                        'cost': {
                            'min': undefined,
                            'max': undefined,
                        },
                    },
                });
            }
        }
        return result;
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        let response = await this.privateGetBalances ();
        let balances = response['balances'];
        let result = { 'info': response };
        for (let b = 0; b < balances.length; b++) {
            let balance = balances[b];
            let currency = balance['currency'];
            let free = balance['trading_balance'];
            let total = balance['balance'];
            let used = total - free;
            let account = {
                'free': free,
                'used': used,
                'total': total,
            };
            result[currency] = account;
        }
        return this.parseBalance (result);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let orderbook = await this.publicGetFundsIdOrderbook (this.extend ({
            'id': this.marketId (symbol),
        }, params));
        let timestamp = this.parse8601 (orderbook['date']);
        return this.parseOrderBook (orderbook, timestamp, 'bids', 'asks', 'price', 'amount');
    }

    parseTicker (ticker, market = undefined) {
        let timestamp = this.parse8601 (ticker['date']);
        let symbol = undefined;
        if (market)
            symbol = market['symbol'];
        let last = this.safeFloat (ticker, 'last');
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeFloat (ticker, 'high'),
            'low': this.safeFloat (ticker, 'low'),
            'bid': this.safeFloat (ticker, 'bid'),
            'bidVolume': undefined,
            'ask': this.safeFloat (ticker, 'ask'),
            'askVolume': undefined,
            'vwap': undefined,
            'open': this.safeFloat (ticker, 'open'),
            'close': last,
            'last': last,
            'previousClose': this.safeFloat (ticker, 'close'), // previous day close, if any
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': this.safeFloat (ticker, 'volume_traded'),
            'quoteVolume': this.safeFloat (ticker, 'volume'),
            'info': ticker,
        };
    }

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.publicGetFundsTickers (params);
        let tickers = this.indexBy (response['tickers'], 'fund_id');
        let ids = Object.keys (tickers);
        let result = {};
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let market = this.markets_by_id[id];
            let symbol = market['symbol'];
            let ticker = tickers[id];
            result[symbol] = this.parseTicker (ticker, market);
        }
        return result;
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let ticker = await this.publicGetFundsIdTicker (this.extend ({
            'id': market['id'],
        }, params));
        return this.parseTicker (ticker, market);
    }

    parseTrade (trade, market = undefined) {
        //
        // fetchTrades
        //
        //     {      id:  4493548,
        //       fund_id: "ETHBTC",
        //        amount:  0.203,
        //         price:  0.02783576,
        //          side: "buy",
        //          dark:  false,
        //          date: "2018-11-30T08:19:18.236Z" }
        //
        // fetchMyTrades
        //
        //     {           id:    237338,
        //            fund_id:   "BTCEUR",
        //             amount:    0.348,
        //              price:    348,
        //               side:   "sell",
        //               dark:    false,
        //           order_id:    14920648,
        //               date:   "2015-06-03T00:49:49.000Z",
        //       transactions: [ {       id:  2770768,
        //                             date: "2015-06-03T00:49:49.000Z",
        //                             type: "sold_currency_to_fund",
        //                            price:  121.1,
        //                         currency: "EUR"                       },
        //                       {       id:  2770769,
        //                             date: "2015-06-03T00:49:49.000Z",
        //                             type: "released_currency_to_fund",
        //                            price:  0.348,
        //                         currency: "BTC"                        },
        //                       {       id:  2770772,
        //                             date: "2015-06-03T00:49:49.000Z",
        //                             type: "paid_commission",
        //                            price:  0.06,
        //                         currency: "EUR",
        //                         trade_id:  440492                     }   ] }
        //
        if (!market)
            market = this.markets_by_id[trade['fund_id']];
        const timestamp = this.parse8601 (this.safeString (trade, 'date'));
        const id = this.safeString (trade, 'id');
        const orderId = this.safeString (trade, 'order_id');
        const side = this.safeString (trade, 'side');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        let cost = undefined;
        if (price !== undefined) {
            if (amount !== undefined) {
                cost = price * amount;
            }
        }
        let fee = undefined;
        let feeCost = undefined;
        const transactions = this.safeValue (trade, 'transactions', []);
        const transactionsByType = this.groupBy (transactions, 'type');
        const feeTransactions = this.safeValue (transactionsByType, 'paid_commission', []);
        for (let i = 0; i < feeTransactions.length; i++) {
            if (feeCost === undefined) {
                feeCost = 0;
            }
            feeCost = this.sum (feeCost, this.safeFloat (feeTransactions[i], 'price'));
        }
        if (feeCost !== undefined) {
            fee = {
                'cost': feeCost,
                'currency': market['quote'],
            };
        }
        return {
            'info': trade,
            'id': id,
            'order': orderId,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': market['symbol'],
            'type': undefined,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
        };
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchMyTrades requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'id': market['id'],
        };
        if (limit !== undefined) {
            request['per_page'] = limit; // default 25 max 200
        }
        if (since !== undefined) {
            request['after'] = this.iso8601 (since);
        }
        const response = await this.privateGetFundsIdTrades (this.extend (request, params));
        //
        //     { trades: [ {           id:    237338,
        //                        fund_id:   "BTCEUR",
        //                         amount:    0.348,
        //                          price:    348,
        //                           side:   "sell",
        //                           dark:    false,
        //                       order_id:    14920648,
        //                           date:   "2015-06-03T00:49:49.000Z",
        //                   transactions: [ {       id:  2770768,
        //                                         date: "2015-06-03T00:49:49.000Z",
        //                                         type: "sold_currency_to_fund",
        //                                        price:  121.1,
        //                                     currency: "EUR"                       },
        //                                   {       id:  2770769,
        //                                         date: "2015-06-03T00:49:49.000Z",
        //                                         type: "released_currency_to_fund",
        //                                        price:  0.348,
        //                                     currency: "BTC"                        },
        //                                   {       id:  2770772,
        //                                         date: "2015-06-03T00:49:49.000Z",
        //                                         type: "paid_commission",
        //                                        price:  0.06,
        //                                     currency: "EUR",
        //                                     trade_id:  440492                     }   ] } ],
        //         meta: { total_count:    31,
        //                       first: { href: "https://api.therocktrading.com/v1/funds/BTCXRP/trades?page=1" },
        //                    previous:    null,
        //                     current: { href: "https://api.therocktrading.com/v1/funds/BTCXRP/trades?page=1" },
        //                        next: { href: "https://api.therocktrading.com/v1/funds/BTCXRP/trades?page=2" },
        //                        last: { href: "https://api.therocktrading.com/v1/funds/BTCXRP/trades?page=2" }  } }
        //
        return this.parseTrades (response['trades'], market, since, limit);
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'id': market['id'],
        };
        if (limit !== undefined) {
            request['per_page'] = limit; // default 25 max 200
        }
        if (since !== undefined) {
            request['after'] = this.iso8601 (since);
        }
        const response = await this.publicGetFundsIdTrades (this.extend (request, params));
        //
        //     { trades: [ {      id:  4493548,
        //                   fund_id: "ETHBTC",
        //                    amount:  0.203,
        //                     price:  0.02783576,
        //                      side: "buy",
        //                      dark:  false,
        //                      date: "2018-11-30T08:19:18.236Z" },
        //                 {      id:  4492926,
        //                   fund_id: "ETHBTC",
        //                    amount:  0.04,
        //                     price:  0.02767034,
        //                      side: "buy",
        //                      dark:  false,
        //                      date: "2018-11-30T07:03:03.897Z" }  ],
        //         meta: { total_count:    null,
        //                       first: { page:  1,
        //                                href: "https://api.therocktrading.com/v1/funds/ETHBTC/trades?page=1" },
        //                    previous:    null,
        //                     current: { page:  1,
        //                                href: "https://api.therocktrading.com/v1/funds/ETHBTC/trades?page=1" },
        //                        next: { page:  2,
        //                                href: "https://api.therocktrading.com/v1/funds/ETHBTC/trades?page=2" },
        //                        last:    null                                                                   } }
        //
        return this.parseTrades (response['trades'], market, since, limit);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        if (type === 'market')
            price = 0;
        let response = await this.privatePostFundsFundIdOrders (this.extend ({
            'fund_id': this.marketId (symbol),
            'side': side,
            'amount': amount,
            'price': price,
        }, params));
        return {
            'info': response,
            'id': response['id'].toString (),
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        return await this.privateDeleteFundsFundIdOrdersId (this.extend ({
            'id': id,
            'fund_id': this.marketId (symbol),
        }, params));
    }

    parseOrderStatus (status) {
        const statuses = {
            'active': 'open',
            'executed': 'closed',
            'deleted': 'canceled',
            // don't know what this status means
            // 'conditional': '?',
        };
        return this.safeString (statuses, status, status);
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'] + '/' + this.version + '/' + this.implodeParams (path, params);
        let query = this.omit (params, this.extractParams (path));
        if (api === 'private') {
            this.checkRequiredCredentials ();
            let nonce = this.nonce ().toString ();
            let auth = nonce + url;
            headers = {
                'X-TRT-KEY': this.apiKey,
                'X-TRT-NONCE': nonce,
                'X-TRT-SIGN': this.hmac (this.encode (auth), this.encode (this.secret), 'sha512'),
            };
            if (Object.keys (query).length) {
                body = this.json (query);
                headers['Content-Type'] = 'application/json';
            }
        } else if (api === 'public') {
            if (Object.keys (query).length) {
                url += '?' + this.rawencode (query);
            }
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('errors' in response)
            throw new ExchangeError (this.id + ' ' + this.json (response));
        return response;
    }

    _websocketOnMessage (contextId, data) {
        let msg = JSON.parse (data);
        // console.log(data);
        this._websocketCheckSequence (contextId, msg);
        let evt = this.safeString (msg, 'event');
        if (evt === 'subscription_succeeded') {
            this._websocketHandleSubscription (contextId, msg);
        } else if (evt === 'orderbook') {
            this._websocketHandleOrderbook (contextId, msg);
        } else if (evt === 'orderbook_diff') {
            this._websocketHandleOrderbookDiff (contextId, msg);
        }
    }

    _websocketCheckSequence (contextId, msg) {
        let msgData = this.safeValue (msg, 'data');
        if (typeof msgData === 'undefined') {
            return;
        }
        let sequeceId = this.safeInteger (msgData, 'sequence');
        if (typeof sequeceId === 'undefined') {
            return;
        }
        let chan = this.safeString (msg, 'channel');
        let lastSeqIdData = this._contextGet (contextId, 'sequence');
        if (typeof lastSeqIdData === 'undefined') {
            lastSeqIdData = {};
        }
        if (chan in lastSeqIdData) {
            let lastSeqId = lastSeqIdData[chan];
            lastSeqId = this.sum (lastSeqId, 1);
            if (sequeceId !== lastSeqId) {
                this.emit ('err', new NetworkError ('sequence error in pusher connection ' + sequeceId + ' !== ' + lastSeqId), contextId);
                return;
            }
        }
        lastSeqIdData[chan] = sequeceId;
        this._contextSet (contextId, 'sequence', lastSeqIdData);
    }

    _websocketHandleOrderbook (contextId, msg) {
        let chan = this.safeString (msg, 'channel');
        let symbol = this.findSymbol (chan);
        let data = this.safeValue (msg, 'data');
        let time = this.safeString (data, 'time');
        let timestamp = this.parse8601 (time);
        let ob = this.parseOrderBook (data, timestamp, 'bids', 'asks', 'price', 'amount');
        let symbolData = this._contextGetSymbolData (contextId, 'ob', symbol);
        symbolData['ob'] = ob;
        this.emit ('ob', symbol, this._cloneOrderBook (ob, symbolData['limit']));
        this._contextSetSymbolData (contextId, 'ob', symbol, symbolData);
    }

    _websocketHandleOrderbookDiff (contextId, msg) {
        let chan = this.safeString (msg, 'channel');
        let symbol = this.findSymbol (chan);
        let symbolData = this._contextGetSymbolData (contextId, 'ob', symbol);
        if (!('ob' in symbolData)) {
            // not previous snapshot -> don't process it
            return;
        }
        let data = this.safeValue (msg, 'data');
        let time = this.safeString (data, 'time');
        let timestamp = this.parse8601 (time);
        let price = this.safeFloat (data, 'price');
        let amount = this.safeFloat (data, 'amount');
        let side = this.safeString (data, 'side');
        side = (side === 'bid') ? 'bids' : 'asks';
        this.updateBidAsk ([price, amount], symbolData['ob'][side], side === 'bids');
        symbolData['ob']['timestamp'] = timestamp;
        symbolData['ob']['datetime'] = this.iso8601 (timestamp);
        this.emit ('ob', symbol, this._cloneOrderBook (symbolData['ob'], symbolData['limit']));
        this._contextSetSymbolData (contextId, 'ob', symbol, symbolData);
    }

    _websocketHandleSubscription (contextId, msg) {
        let chan = this.safeString (msg, 'channel');
        let event = 'ob';
        if (chan === 'currency') {
            event = 'trade';
        }
        let symbol = this.findSymbol (chan);
        let symbolData = this._contextGetSymbolData (contextId, event, symbol);
        if ('sub-nonces' in symbolData) {
            let nonces = symbolData['sub-nonces'];
            const keys = Object.keys (nonces);
            for (let i = 0; i < keys.length; i++) {
                let nonce = keys[i];
                this._cancelTimeout (nonces[nonce]);
                this.emit (nonce, true);
            }
            symbolData['sub-nonces'] = {};
            this._contextSetSymbolData (contextId, event, symbol, symbolData);
        }
    }

    _websocketSubscribe (contextId, event, symbol, nonce, params = {}) {
        if (event !== 'ob') {
            throw new NotSupported ('subscribe ' + event + '(' + symbol + ') not supported for exchange ' + this.id);
        }
        // save nonce for subscription response
        let symbolData = this._contextGetSymbolData (contextId, event, symbol);
        if (!('sub-nonces' in symbolData)) {
            symbolData['sub-nonces'] = {};
        }
        symbolData['limit'] = this.safeInteger (params, 'limit', undefined);
        let nonceStr = nonce.toString ();
        let handle = this._setTimeout (contextId, this.timeout, this._websocketMethodMap ('_websocketTimeoutRemoveNonce'), [contextId, nonceStr, event, symbol, 'sub-nonce']);
        symbolData['sub-nonces'][nonceStr] = handle;
        this._contextSetSymbolData (contextId, event, symbol, symbolData);
        // remove sequenceId
        let sequenceId = undefined;
        this._contextSet (contextId, 'sequence', sequenceId);
        // send request
        const id = this.marketId (symbol);
        this.websocketSendJson ({
            'event': 'subscribe',
            'channel': id,
        }, contextId);
    }

    _websocketUnsubscribe (contextId, event, symbol, nonce, params = {}) {
        if (event !== 'ob') {
            throw new NotSupported ('unsubscribe ' + event + '(' + symbol + ') not supported for exchange ' + this.id);
        }
        let id = this.market_id (symbol);
        let payload = {
            'event': 'unsubscribe',
            'channel': id,
        };
        let nonceStr = nonce.toString ();
        this.websocketSendJson (payload);
        this.emit (nonceStr, true);
    }

    _websocketTimeoutRemoveNonce (contextId, timerNonce, event, symbol, key) {
        let symbolData = this._contextGetSymbolData (contextId, event, symbol);
        if (key in symbolData) {
            let nonces = symbolData[key];
            if (timerNonce in nonces) {
                this.omit (symbolData[key], timerNonce);
                this._contextSetSymbolData (contextId, event, symbol, symbolData);
            }
        }
    }

    _getCurrentWebsocketOrderbook (contextId, symbol, limit) {
        let data = this._contextGetSymbolData (contextId, 'ob', symbol);
        if (('ob' in data) && (typeof data['ob'] !== 'undefined')) {
            return this._cloneOrderBook (data['ob'], limit);
        }
        return undefined;
    }
};
