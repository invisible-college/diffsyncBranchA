
var diffsync = require('./diffsync.js')
console.log('diffsync version ' + diffsync.version)

var bus = require('statebus')()
bus.sqlite_store()

var channels = {}
for (var key in bus.cache) {
    if (!bus.cache.hasOwnProperty(key)) { continue }
    var o = bus.cache[key]
    if (key.startsWith('commit/')) {
        if (!channels[o.channel])
            channels[o.channel] = { commits : {}, members : {} }
        channels[o.channel].commits[o.id] = o.commit
    }
    if (key.startsWith('member/')) {
        if (!channels[o.channel])
            channels[o.channel] = { commits : {}, members : {} }
        channels[o.channel].members[o.id] = o.member
    }
}

var fs = require('fs')
var web_server = null
var server_type = null
if (fs.existsSync('privkey.pem') && fs.existsSync('fullchain.pem')) {
    web_server = require('https').createServer({
        key : fs.readFileSync('privkey.pem'),
        cert : fs.readFileSync('fullchain.pem')
    })
    server_type = 'https'
} else {
    web_server = require('http').createServer()
    server_type = 'http'
}
var port = diffsync.port
web_server.listen(port)
console.log('openning ' + server_type + ' server on port ' + port)
var WebSocket = require('ws')
var wss = new WebSocket.Server({ server : web_server })

var diff_server = diffsync.create_server({
    wss : wss,
    initial_data : channels,
    on_change : function (changes) {
        for (var id in changes.commits) {
            if (!changes.commits.hasOwnProperty(id)) { continue }

            var c = changes.commits[id]
            var key = 'commit/' + id
            if (c) {
                bus.save({
                    key : key,
                    id : id,
                    channel : changes.channel,
                    commit : c
                })
            } else {
                // work here
                console.log('DELETING: ' + key)

                bus.del(key)
            }
        }
        for (var id in changes.members) {
            if (!changes.members.hasOwnProperty(id)) { continue }

            var m = changes.members[id]
            var key = 'member/' + id + '/of/' + changes.channel
            if (m) {
                bus.save({
                    key : key,
                    id : id,
                    channel : changes.channel,
                    member : m
                })
            } else {
                // work here
                console.log('DELETING: ' + key)

                bus.del(key)
            }
        }


        // work here
        for (var row of bus.sqlite_store_db.prepare('select * from cache').iterate()) {
            var obj = JSON.parse(row.obj)
            console.log('obj: ', obj)
        }
        throw 'bloop'



        var bus_ids = {}
        each(bus.cache, function (c, id) {
            if (!id.startsWith('commit')) { return }
            if (c.channel != changes.channel) { return }
            bus_ids[c.id] = true
        })

        var minigit_ids = {}
        each(diff_server.channels[changes.channel].minigit.commits, function (c, id) {
            minigit_ids[id] = true
        })

        var diff = false
        each(bus_ids, function (_, id) {
            if (!minigit_ids[id]) diff = true
        })
        each(minigit_ids, function (_, id) {
            if (!bus_ids[id]) diff = true
        })
        if (diff) {
            console.log('changes:', changes)
            console.log('bus.cache:', bus.cache)
            console.log('minigit  :', diff_server.channels[changes.channel].minigit.commits)
            console.log('BAD!')
            throw 'BAD!'
        }
    }
})

// work here
function each(o, cb) {
    if (o instanceof Array) {
        for (var i = 0; i < o.length; i++) {
            if (cb(o[i], i, o) == false)
                return false
        }
    } else {
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                if (cb(o[k], k, o) == false)
                    return false
            }
        }
    }
    return true
}
