/*
 * routes requests for development
 *
 * you need to install npm modules http and http-proxy. in this directory, run:
 *
 * npm install http
 * npm install http-proxy
 *
 * run using: 
 *
 * node ./dev-proxy.js
 */

var http = require('http'),
    httpProxy = require('http-proxy');

var OMERO_WEBCLIENT_URL = 'http://127.0.0.1:4080';
var OMERO_IVIEWER_DEVSERVER = 'http://127.0.0.1:3000';

var proxy = httpProxy.createProxyServer({ws:true});

var server = http.createServer(function(req, res) {

    if (req.url.startsWith('/static/omero_iviewer/bundle.js')) {
        target_host = OMERO_IVIEWER_DEVSERVER;
        new_url = req.url.replace("/static/omero_iviewer/", "/");
        req.url = new_url;
        log_char = 'IVIEWER DEV';
    } else {
        target_host = OMERO_WEBCLIENT_URL;
        log_char = 'OMERO.web';
    }
    proxy.web(req, res, { target: target_host });
    console.log(req.url + ' -> ' + log_char + ' = ' + target_host);

});

console.log("^ = 4080; * = static/omero_iviewer/bundle.js");
console.log("Listening on port 5050")
server.listen(5050);



