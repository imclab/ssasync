var assert = require('assert')
  , async = require('../async')
  , redback = require('redback')
  , cache = redback.createClient().createCache('ssasync_test');

describe('Async', function () {
    it('should retry functions when they fail', function (done) {
        var i = 0;
        function test(callback) {
            callback(++i);
        }
        async.retry(10, test)(function (err) {
            assert.equal(11, err);
            done();
        });
    });
    it('should run functions sequentially', function (done) {
        var str = '';
        function add(num, callback) { str += (num + ''); callback(); }
        async.sequential(['1','2','3'], add, function (err) {
            assert(!err, err);
            assert.equal('123', str);
            done();
        });
    });
    it('should not fail if no args are passed to sequential()', function (done) {
        async.sequential([], function(){}, function (err) {
            assert(!err, err);
            done();
        });
    });
    it('should bail early if an error occurs during sequential()', function (done) {
        var str = '';
        function add(num, callback) {
            if (num === '2') return callback('fail!');
            str += (num + ''); callback();
        }
        async.sequential(['1','2','3'], add, function (err) {
            assert.equal('fail!', err);
            assert.equal('1', str);
            done();
        });
    });
    it('should run functions in parallel', function (done) {
        var str = '';
        function add(num, callback) {
            setTimeout(function () {
                str += (num + ''); callback();
            }, num);
        }
        async.parallel(['2','3','1','4'], add, function (err) {
            assert(!err, err);
            assert.equal('1234', str);
            done();
        });
    });
    it('should not fail if no args are passed to parallel()', function (done) {
        async.parallel([], function(){}, function (err) {
            assert(!err, err);
            done();
        });
    });
    it('should bail early if an error occurs in parallel()', function (done) {
        var str = '';
        function add(num, callback) {
            setTimeout(function () {
                if (num === '3' || num === '4') return callback('foo');
                str += (num + ''); callback();
            }, num);
        }
        async.parallel(['2','3','1','4'], add, function (err) {
            assert.equal('foo', err);
            assert.equal('12', str);
            done();
        });
    });
    it('should memoise functions', function (done) {
        var calls = 0;
        var proto = {
            query: function (query, callback) {
                calls++;
                callback(null, query);
            }
          , foo: 'bar'
        }
        async.memoise(cache, proto, 1);
        assert(proto.foo, 'bar');
        proto.query('foo', function (err, result) {
            assert(!err, err);
            assert.equal(result, 'foo');
            assert.equal(1, calls);
            proto.query('foo', function (err, result) {
                assert(!err, err);
                assert.equal(result, 'foo');
                assert.equal(1, calls);
                proto.query('bar', function (err, result) {
                    assert(!err, err);
                    assert.equal(result, 'bar');
                    assert.equal(2, calls);
                    done();
                });
            });
        });
    });
    it('shouldn\'t memoise if the function fails', function (done) {
        var calls = 0;
        var proto = {
            query: function (query, callback) {
                calls++;
                callback('fail');
            }
        }
        async.memoise(cache, proto, 1);
        proto.query('bla', function (err) {
            assert(err);
            proto.query('bla', function (err) {
                assert(err);
                assert.equal(2, calls);
                done();
            });
        });
    });
    it('should provide flood protection for functions with args', function (done) {
        var calls = 0, results = 0;
        var fn = function (arg, cb) {
            calls++;
            process.nextTick(cb);
        };
        var cb = function () {
            results++;
        };
        var proto = { foo: fn };
        async.floodProtection(proto, 'foo');
        proto.foo('a', cb);
        proto.foo('a', cb);
        proto.foo('a', cb);
        process.nextTick(function () {
            assert.equal(calls, 1);
            assert.equal(results, 3);
            done();
        });
    });
    it('should provide flood protection for functions without args', function (done) {
        var calls = 0, results = 0;
        var fn = function (cb) {
            calls++;
            process.nextTick(cb);
        };
        var cb = function () {
            results++;
        };
        var proto = { foo: fn };
        async.floodProtection(proto, 'foo');
        proto.foo(cb);
        proto.foo(cb);
        proto.foo(cb);
        process.nextTick(function () {
            assert.equal(calls, 1);
            assert.equal(results, 3);
            done();
        });
    });
    it('should throttle calls to a function', function (done) {
        var str = '';
        var proto = { foo: function (num, cb) {
            setTimeout(function () {
                str += num;
                cb();
            }, num);
        }};
        var noop = function () {};
        async.throttle(proto, 'foo', 2);
        proto.foo(4, noop);
        proto.foo(2, noop);
        proto.foo(3, noop);
        proto.foo(5, noop);
        setTimeout(function () {
            assert.equal(str, '2435');
            done();
        }, 20);
    });
    it('should throttle calls to a function 2', function (done) {
        var str = '';
        var proto = { foo: function (num, cb) {
            setTimeout(function () {
                str += num;
                cb();
            }, num);
        }};
        var noop = function () {};
        async.throttle(proto, 'foo', 1);
        proto.foo(3, noop);
        proto.foo(4, noop);
        proto.foo(1, noop);
        proto.foo(2, noop);
        setTimeout(function () {
            assert.equal(str, '3412');
            done();
        }, 31);
    });
});

