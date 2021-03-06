'use strict';

const unleash = require('unleash-server');
const myCustomAdminAuth = require('./auth-hook.js');

let options = { adminAuthentication: 'custom', preRouterHook: myCustomAdminAuth };

unleash.start(options);
