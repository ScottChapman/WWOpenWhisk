var _ = require('lodash');
//var simple = require('./samples/schedule.json');
function getHCCommand(cmd) {
  var object = {};

  if (cmd.hasOwnProperty("annotationPayload")) {
    var payload = cmd.annotationPayload;
    console.log("Lens: " + payload.lens);
    object.lens = payload.lens;
    if (payload.hasOwnProperty("category")) {
      console.log("Category: " + payload.category);
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
        console.dir(small);
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

getHCCommand(require('./samples/labtest.json'));
