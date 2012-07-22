var crypto = require('crypto')
  , util = require('util')
  , async = module.exports;

/**
 * A helper for running asynchronous functions in parallel.
 *
 * The `each` fn receives (arg, callback) for each arg in `args`
 * and must call `callback(err = null)` when complete.
 *
 * @param {Array} args
 * @param {Number} concurrency (optional)
 * @param {Function} each
 * @param {Function} callback
 * @api public
 */

async.parallel = function (args, concurrency, each, callback) {
    if (typeof concurrency === 'function') {
        callback = each;
        each = concurrency;
        concurrency = args.length;
    }
    var len = args.length, pending = len, pos = 0, error;
    if (!len) return callback();
    function next() {
        if (pos >= len) return;
        var arg = args[pos++];
        each(arg, function (err) {
            if (err || error) {
                if (!error) {
                    error = true;
                    callback(err);
                }
                return;
            }
            if (!--pending) return callback();
            process.nextTick(next);
        });
    }
    while (concurrency--) next();
};

/**
 * A helper for running asynchronous functions sequentially.
 *
 * The `each` fn receives (arg, callback) for each arg in `args`
 * and must call `callback(err = null)` when complete.
 *
 * @param {Array} args
 * @param {Function} each
 * @param {Function} callback
 * @api public
 */

async.sequential = function (args, each, callback) {
    var remaining = args.length, pos = 0;
    if (!remaining) return callback();
    (function next() {
        var arg = args[pos++];
        each(arg, function (err) {
            if (err || !--remaining) return callback(err)
            process.nextTick(next);
        });
    })();
};

/**
 * Return a function which retries when it fails.
 *
 * @param {Number} retries
 * @param {Function} fn
 * @return {Function} retry_fn
 * @api public
 */

async.retry = function (retries, fn) {
    return function () {
        var args = Array.prototype.slice.call(arguments)
          , callback = args.pop()
          , scope = this;
        function exec() {
            fn.apply(scope, args);
        }
        args.push(function (err) {
            if (err && retries-- > 0) {
                return process.nextTick(exec);
            }
            callback.apply(this, arguments);
        });
        exec();
    };
};

/**
 * Memoise asynchronous function calls. `cache` must be an object that
 * exports `get(key, callback)` and `set(key, value, ttl, [callback])`.
 *
 * @param {Object} cache
 * @param {Object} obj - contains functions to memoise
 * @param {Object|Number} ttls - { fn_name: ttl, fn_name2: ttl, ... }
 * @param {Boolean} entropy (optional) - apply a random multipler to ttl
 */

async.memoise = function (cache, obj, ttls, entropy) {
    if (typeof ttls !== 'object') {
        var ttl = ttls;
        ttls = {};
        Object.keys(obj).filter(function (key) {
            return typeof obj[key] === 'function';
        }).forEach(function (method) {
            ttls[method] = ttl;
        });
    }
    if (entropy || typeof entropy === 'undefined') {
        Object.keys(ttls).forEach(function (key) {
            //Apply a multipler between 0.9 and 1.1
            ttls[key] = async.entropy(ttls[key], 0.1)
        });
    }
    for (var fn in ttls) {
        (function (fn) {
            var original = obj[fn];

            //Replace each function with a version that caches the result
            obj[fn] = function () {
                var args = Array.prototype.slice.call(arguments)
                  , callback = args.pop()
                  , hash = fn + ':' + async.md5(JSON.stringify(args))
                  , scope = this;

                //Check for a cached result
                cache.get(hash, function (err, result) {
                    if (!err && result) {
                        return callback(null, JSON.parse(result));
                    }

                    //If not found, bootstrap the callback and call the original
                    args.push(function (err, result) {
                        if (err) {
                            return callback(err);
                        }
                        cache.set(hash, JSON.stringify(result), ttls[fn]);
                        callback(null, result);
                    });
                    original.apply(scope, args);
                });
            };
        })(fn);
    }
};

/**
 * TTL sugar for async.memoise.
 */

async.one = {
    hour: 3600
  , day: 86400
  , week: 604800
  , month: 2592000
};

/**
 * Prevent a function from being called with the same arguments simultaneously.
 *
 * @param {Object} prototype
 * @param {String} fn_name
 * @api public
 */

async.floodProtection = function (prototype, fn_name) {
    var original = prototype[fn_name]
      , queue = {};
    prototype[fn_name] = function () {
        var args = Array.prototype.slice.call(arguments)
          , callback = args.pop()
          , hash = fn_name + ':' + JSON.stringify(args);
        if (hash in queue) {
            queue[hash].push(callback);
            return;
        } else {
            queue[hash] = [ callback ];
        }
        args.push(function (err) {
            var result = Array.prototype.slice.call(arguments);
            queue[hash].forEach(function (callback) {
                callback.apply(null, result);
            });
            delete queue[hash];
        });
        original.apply(prototype, args);
    };
};

/**
 * Throttle calls to a function.
 *
 * @param {Object} prototype
 * @param {String} fn_name
 * @param {Number} max - max to run at a time
 * @api public
 */

async.throttle = function (prototype, fn_name, max) {
    var original = prototype[fn_name]
      , pending = [], remaining = 0;
    prototype[fn_name] = function () {
        var args = Array.prototype.slice.call(arguments)
          , scope = this;
        if (remaining >= max) {
            pending.push({ args: args, scope: scope });
            return;
        }
        var callback = args.pop();
        args.push(function () {
            var args = Array.prototype.slice.call(arguments);
            process.nextTick(function () {
                callback.apply(this, args);
                remaining--;
                while (remaining < max && pending.length) {
                    var next = pending.shift();
                    prototype[fn_name].apply(next.scope, next.args);
                }
            });
        });
        remaining++;
        original.apply(prototype, args);
    };
};

/**
 * Apply a random multiplier so that num is within +/-offset.
 *
 * @param {Number} num
 * @param {Number} offset
 * @api private
 */

async.entropy = function (num, offset) {
    return Math.round(num * (Math.random() / (1/offset/2) + (1-offset)));
};

/**
 * Get the MD5 hash of a string.
 *
 * @param {String} str
 * @return {String} hash
 * @api private
 */

async.md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex');
};

