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

function genActionClick(text,title,buttons) {
// Generate template annotation
  const annotations = util.format(`
    {
      genericAnnotation: {
        title: "%s"
        text: "%s"
        color: "#6CB7FB"
          actor: {
            name: "HealthCare Bot V1.0"
            avatar: "https://scwatsonwork-echo.mybluemix.net/bot.png"
            url: "https://github.com/watsonwork/watsonwork-echo"
          }
        buttons: [ %s ]
      }
    }`, title, text,
      // Generate buttons
      (buttons || []).map((b) => util.format(`{
        postbackButton: {
          title: "%s",
          id: "%s",
          style: %s
        }
      }`, b[0], b[1], b[2] || 'PRIMARY')).join(','));
    return annotations;
}

function genMutation(annotations,actionAnnotation) {
  var payload = actionAnnotation.annotationPayload;
  var str = util.format(`
      mutation {
        createTargetedMessage(input: {
          conversationId: "%s"
          targetUserId: "%s"
          targetDialogId: "%s"
          annotations: [ %s ]
        }) {
          successful
        }
      }`, actionAnnotation.spaceId, actionAnnotation.userId, payload.actionId, annotations);
  console.log("Mutation: " + str);
  return str;
}

// Debug log
const log = debug('watsonwork-echo-app');

// Echoes Watson Work chat messages containing 'hello' or 'hey' back
// to the space they were sent to
export const echo = (appId, token) => (req, res) => {
  // Respond to the Webhook right away, as the response message will
  // be sent asynchronously
  res.status(201).end();

  // Only handle message-created Webhook events, and ignore the app's
  // own messages
  // if(req.body.type !== 'message-annotation-added')
  if(req.body.type !== 'message-annotation-added')
    return;

	io.sockets.emit('webhook-event', {eventTime: new Date(), body: req.body});

  req.body.annotationPayload = JSON.parse(req.body.annotationPayload);

  console.log("AnnotationType: %s", req.body.annotationType);

  if(req.body.annotationPayload.applicationId !== appId)
    return;

  if (req.body.annotationType === "actionSelected") {
    log("Got an action selected event!");
    var annotations = genActionClick("MyText","MyTitle",[["first","1","PRIMARY"],["second","2","SECONDARY"]]);
    log("Annotation: %s", annotations);
    var mutation = genMutation(annotations,req.body);
    log("Mutation: %s", mutation);
  	io.sockets.emit('debug-event', mutation);
    graphQL(token(), mutation, (err,res) => {
      if(!err) {
        log('Got graphQL Response back! %o', res.body);
      }
      else {
        log("Error with graphQL request... %o", err)
      }
    });
  }

  var command = getHCCommand(req.body);
  log('Got a Lens %o', command);

  // Send the echo message
  generateResponse(command, resp => {
    send(req.body.spaceId,
        resp,
      token(),
      (err, res) => {
        if(!err)
          log('Sent message to space %s', req.body.spaceId);
      });
  })
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

function getLabResult(command, callback) {
  if (!command.hasOwnProperty('entities')) return null;
  console.log("getLabResults!");
  console.dir(command.entities);
  command.entities.forEach(function (entity) {
    console.dir(entity);
    if (entity.source === "Conversation" &&
      ((entity.type === "vitals") || (entity.type === 'labtest') || (entity.type === 'bloodtest') || (entity.type === 'condition'))) {
      console.log("Got an entity that is vitals: ", entity.text);
      switch(entity.text) {
          case 'systolic':
          case 'Hypertension':
          case 'diastolic':
          case 'blood pressure':
              console.log("Blood pressure!");
              callback(
                {
                  command: "Lab Result",
                  message: "Blood pressure was 140/85 when last checked on Dec. 12, 2014"
                }
              );
              break;
          case 'blood sugar':
          case 'Diabetes':
          case 'Glucose':
              console.log("Blood sugar!");
              callback(
                {
                  command: "Lab Result",
                  message: "A1C was 6.8% and blood sugar was 126 mg/dL when last checked on Dec. 12, 2014"
                }
              );
              break;
          default:
              console.log("unknown!");
              callback(
                {
                  command: "Lab Result",
                  message: util.format("We don't have any lab results for %s.", entity.text)
                }
              );
      }
    }
  })
}

function getLabRequest(command, callback) {
  if (!command.hasOwnProperty('entities')) return null;
  command.entities.forEach(function (entity) {
    if (entity.source === "Conversation" &&
      ((entity.type === "vitals") || (entity.type === 'labtest') || (entity.type === 'bloodtest') || (entity.type === 'condition'))) {
      callback(
        {
          command: "Lab Request",
          message: util.format("I've added a %s test for the next appointment.", entity.text)
        }
      );
    }
    else {
      callback(
        {
          command: "Lab Request",
          message: util.format("Sorry, not clear about what test to order.", entity.text)
        }
      );
      }
  })
}

function getFollowup(command, callback) {
  var caregiver = null;
  var from = null
  var to = null;
  command.entities.forEach(function (entity) {
    switch (entity.type) {
      case 'caregiver':
        caregiver = entity.text;
        break;
      case 'sys-date':
        if (from !== null)
          to = entity.text;
        else {
          from = entity.text;
        }
    }
  })

  if (caregiver === null) caregiver = "primary care";
  if (to !== null)
      callback(
        {
          command: "Followup Appointment",
          message: util.format("We'll schedule a follow up with %s between %s and %s.", caregiver,from,to)
        }
      );
  else if (from !== null)
      callback(
        {
          command: "Followup Appointment",
          message: util.format("We'll schedule a follow up with %s on %s.", caregiver,from)
        }
      );
  else
      callback(
        {
          command: "Followup Appointment",
          message: util.format("We'll schedule a follow up appointment with %s.", caregiver)
        }
      );
}

function generateResponse(command, callback) {
  if (command.lens === 'Request' && command.hasOwnProperty('category') && command.category === "LabResults") {
    getLabResult(command,callback);
  }
  else if (command.lens === 'Request' && command.hasOwnProperty('category') && command.category === "Labs") {
    getLabRequest(command,callback);
  }
  else if (command.lens === 'Followup') {
    getFollowup(command,callback);
  }
}

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

function getHCCommand(cmd) {
  var object = {};

  if (cmd.hasOwnProperty("annotationPayload")) {
    var payload = cmd.annotationPayload;
    // console.log("Lens: " + payload.lens);
    object.lens = payload.lens;
    if (payload.hasOwnProperty("category")) {
      // console.log("Category: " + payload.category);
      object.category = payload.category;
    }

    if (payload.hasOwnProperty("extractedInfo")) {
      var info = payload.extractedInfo;
      if (info.hasOwnProperty("entities")) {
        var entities = info.entities;
        var small = _.map(_.filter(entities,{"source": "Conversation"}),(entity) => {
          return _.pick(entity,["source","text","type"]);
        });
        object.entities = small;
        // console.dir(small);
        /*
        _.filter(entities,{"source": "Conversation"}).forEach((entity) => {
          console.dir(_.pick(entity,["source","text","type"]))
        })
        */
      }
    }
  }
  return object;
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
