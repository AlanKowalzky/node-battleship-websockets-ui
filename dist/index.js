'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const index_js_1 = require('./src/http_server/index.js');
const HTTP_PORT = 8181;
console.log(`Start static http server on the ${HTTP_PORT} port!`);
index_js_1.httpServer.listen(HTTP_PORT);
