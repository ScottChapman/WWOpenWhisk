// A sample chatbot app that listens to messages posted to a space in IBM
// Watson Workspace and echoes hello messages back to the space

import express from 'express';
import * as request from 'request';
import * as util from 'util';
import * as bparser from 'body-parser';
import { createHmac } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as oauth from './oauth';
import * as ssl from './ssl';
import debug from 'debug';
import * as path from 'path';
import * as socket from 'socket.io';
import * as fs from 'fs';
import * as _ from 'lodash';
var io;
var openwhisk = require('openwhisk');
const options = {
  apihost: 'https://openwhisk.ng.bluemix.net',
  namespace: 'scottchapman@us.ibm.com_dev',
  api_key: '227778f3-72d3-4cce-884e-60d695ee8dec:IP4nHlkSExBB7uPHTgfs1PJ7fMAtqjn5REFKDkgRKJkPHWJuizWcKm4z20m9Xdkb'
};
var ow = openwhisk(options);


// Debug log
const log = debug('watsonwork-echo-app');

// Echoes Watson Work chat messages containing 'hello' or 'hey' back
// to the space they were sent to
export const echo = (appId, token) => (req, res) => {
  // Respond to the Webhook right away, as the response message will
  // be sent asynchronously
  res.status(201).end();

  req.body.token = token();

  if (req.body.hasOwnProperty('annotationPayload')) {
    req.body.annotationPayload = JSON.parse(req.body.annotationPayload);
    const messageQuery = util.format(`
  		query {
  			message(id: "%s") {
  				content
  		    id
  		    createdBy {
  		      displayName
  		      id
  		      emailAddresses
  		      photoUrl
  		    }
  		  }
  		}`, req.body.messageId);
    // console.log('messageQuery: ' + messageQuery);
    graphQL(token(), messageQuery, (err,res) => {
      if(!err) {
        res.body = JSON.parse(res.body);
        delete req.body.messageId;
        req.body = _.merge(req.body, res.body.data);
      	io.sockets.emit('webhook-event', {eventTime: new Date(), body: req.body});
        ow.triggers.invoke({
          name: 'WWAnnotationEvent',
          blocking: true,
          result: true,
          params: req.body}).then(result => console.log(result))
      }
      else {
        log("Error with graphQL request... %o", err)
      }
    });

  }
  else {
  	io.sockets.emit('webhook-event', {eventTime: new Date(), body: req.body});
    ow.triggers.invoke({
      name: 'WWMessageEvent',
      blocking: true,
      result: true,
      params: req.body}).then(result => console.log(result))
  }

  // log('SpaceID: %s', req.body.spaceId);
  // log('SpaceName: %s', req.body.spaceName);
  // log('userName: %s', req.body.userName);
  // log('Token: %s', token());
  /*
  const spaceQuery = util.format('{ space(id:"%s"){ title description created updated id } }', req.body.spaceId);
  log('spaceQuery: %s', spaceQuery);
  graphQL(token(), spaceQuery, (err,res) => {
    if(!err) {
      log('Got graphQL Response back! %o', res.body);
    }
    else {
      log("Error with graphQL request... %o", err)
    }
  });

*/
  // React to 'hello' or 'hey' keywords in the message and send an echo
  // message back to the conversation in the originating space
  // if(req.body.content
    // // Tokenize the message text into individual words
    // .split(/[^A-Za-z0-9]+/)
    // // Look for the hello and hey words
    // .filter((word) => /^(hello|hey)$/i.test(word)).length)

    // Send the echo message
    // send(req.body.spaceId,
      // util.format(
        // 'Hey %s, did you say %s?',
        // req.body.userName, req.body.content),
      // token(),
      // (err, res) => {
        // if(!err)
          // log('Sent message to space %s', req.body.spaceId);
      // });
};

const graphQL = (token, body, callback) => {
  request.post(
    'https://watsonwork.ibm.com/graphql', {
      headers: {
        'Content-Type': 'application/graphql',
        'Authorization': 'Bearer ' + token,
        'x-graphql-view': 'ACTIONS,PUBLIC'
      },
      body: body
    }, (err,response) => {
      log("ERROR: %o", err);
      log("RESPONSE: %o", response.body);
      log("STATUS: %s", response.statusCode);
      if(err || response.statusCode !== 200 || response.body.hasOwnProperty("errors")) {
        callback(err || new Error(JSON.stringify(response.body.errors)));
        return;
      }
      callback(err,response);
    } );
}

// Send an app message to the conversation in a space
const send = (spaceId, text, tok, cb) => {
  request.post(
    'https://api.watsonwork.ibm.com/v1/spaces/' + spaceId + '/messages', {
      headers: {
        Authorization: 'Bearer ' + tok
      },
      json: true,
      // An App message can specify a color, a title, markdown text and
      // an 'actor' useful to show where the message is coming from
      body: {
        type: 'appMessage',
        version: 1.0,
        annotations: [{
          type: 'generic',
          version: 1.0,

          color: '#6CB7FB',
          title: text.command,
          text: text.message,

          actor: {
            name: 'HealthCare Bot V1.0',
            avatar: 'https://scwatsonwork-echo.mybluemix.net/bot.png',
            url: 'https://github.com/watsonwork/watsonwork-echo'
          }
        }]
      }
    }, (err, res) => {
      if(err || res.statusCode !== 201) {
        log('Error sending message %o', err || res.statusCode);
        cb(err || new Error(res.statusCode));
        return;
      }
      log('Send result %d, %o', res.statusCode, res.body);
      cb(null, res.body);
    });
};

// Verify Watson Work request signature
export const verify = (wsecret) => (req, res, buf, encoding) => {
  if(req.get('X-OUTBOUND-TOKEN') !==
    createHmac('sha256', wsecret).update(buf).digest('hex')) {
    log('Invalid request signature');
    const err = new Error('Invalid request signature');
    err.status = 401;
    throw err;
  }
};

// Handle Watson Work Webhook challenge requests
export const challenge = (wsecret) => (req, res, next) => {
  if(req.body.type === 'verification') {
    log('Got Webhook verification challenge %o', req.body);
    const body = JSON.stringify({
      response: req.body.challenge
    });
    res.set('X-OUTBOUND-TOKEN',
      createHmac('sha256', wsecret).update(body).digest('hex'));
    res.type('json').send(body);
    return;
  }
  next();
};

// Create Express App
const app = express();

// serve the files out of ./public as our main files
app.use(express.static(path.dirname(__dirname) + "/public"));
log("Using path: " + path.dirname(__dirname) + "/public");

app.get("/Activity", function(req, res) {
	fs.readFile(path.dirname(__dirname) + "/public/webhook.html", 'utf-8', function(err, data) {
    if (err) {
      console.log("Error:" + err);
      res.writeHead(500);
      return res.end("Error loading webhook-event-log.html");
    }
    res.writeHead(200);
    res.end(data);
  });
});

// Create Express Web app
export const webapp = (appId, secret, wsecret, cb) => {
  // Authenticate the app and get an OAuth token
  oauth.run(appId, secret, (err, token) => {
    if(err) {
      cb(err);
      return;
    }

    // Return the Express Web app
    cb(null, app

      // Configure Express route for the app Webhook
      .post('/OpenWhisk',

        // Verify Watson Work request signature and parse request body
        bparser.json({
          type: '*/*',
          verify: verify(wsecret)
        }),

        // Handle Watson Work Webhook challenge requests
        challenge(wsecret),

        // Handle Watson Work messages
        echo(appId, token)));
  });
};

// App main entry point
const main = (argv, env, cb) => {
  // Create Express Web app
  log("ECHO_APP_ID: %s", env.ECHO_APP_ID);
  log("ECHO_APP_SECRET: %s", env.ECHO_APP_SECRET);
  log("ECHO_WEBHOOK_SECRET: %s", env.ECHO_WEBHOOK_SECRET);
  webapp(
    env.ECHO_APP_ID, env.ECHO_APP_SECRET,
    env.ECHO_WEBHOOK_SECRET, (err, app) => {
      if(err) {
        cb(err);
        return;
      }

      if(env.PORT) {
        // In a hosting environment like Bluemix for example, HTTPS is
        // handled by a reverse proxy in front of the app, just listen
        // on the configured HTTP port
        log('HTTP server listening on port %d', env.PORT);
        io = socket.listen(http.createServer(app).listen(env.PORT, cb));
      }

      else
        // Listen on the configured HTTPS port, default to 443
        ssl.conf(env, (err, conf) => {
          if(err) {
            cb(err);
            return;
          }
          const port = env.SSLPORT || 443;
          log('HTTPS server listening on port %d', port);
          https.createServer(conf, app).listen(port, cb);
        });
    });
};

if (require.main === module)
  main(process.argv, process.env, (err) => {
    if(err) {
      console.log('Error starting app:', err);
      return;
    }
    log('App started');
  });

  console.log("service Credentials");
  console.log(process.env.VCAP_SERVICES);

  function getServiceCreds(name) {
   if (process.env.VCAP_SERVICES) {
      var services = JSON.parse(process.env.VCAP_SERVICES);
      for (var service_name in services) {
         if (service_name.indexOf(name) === 0) {
            var service = services[service_name][0];
            return {
               url: service.credentials.url,
               username: service.credentials.username,
               password: service.credentials.password
            };
         }
      }
   }
 }
