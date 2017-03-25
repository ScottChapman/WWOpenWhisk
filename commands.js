var util = require('util');

// How did her blood sugar look?
var responses = [
  {
    "lens": "Request",
    "category": "LabResults",
    "entities": [
      {
        "source": "Conversation",
        "text": "blood sugar",
        "type": "vitals"
      }
    ]
  },

  // Let's check her blood pressure.
  {
    "lens": "Request",
    "category": "Labs",
    "entities": [
      {
        "source": "Conversation",
        "text": "blood pressure",
        "type": "vitals"
      }
    ]
  },

  // we can schedule a followup with her primary care next month.
  {
    "lens": "Followup",
    "entities": [
      {
        "source": "Conversation",
        "text": "primary care",
        "type": "caregiver"
      },
      {
        "source": "Conversation",
        "text": "2017-03-01",
        "type": "sys-date"
      },
      {
        "source": "Conversation",
        "text": "2017-03-31",
        "type": "sys-date"
      }
    ]
  }
];

function getLabResult(command, callback) {
  if (!command.hasOwnProperty('entities')) return null;
  console.log("getLabResults!");
  console.dir(command.entities);
  command.entities.forEach(function (entity) {
    console.dir(entity);
    if (entity.source === "Conversation" && entity.type === "vitals") {
      console.log("Got an entity that is vitals: ", entity.text);
      switch(entity.text) {
          case 'blood pressure':
              console.log("Blood pressure!");
              callback("Blood pressure was 140/85 when last checked on Dec. 12, 2014");
              break;
          case 'blood sugar':
              console.log("Blood sugar!");
              callback("A1C was 6.8% and blood sugar was 126 mg/dL when last checked on Dec. 12, 2014");
              break;
          default:
              console.log("unknown!");
              callback(util.format("We don't have any lab results for %s.", entity.text));
      }
    }
  })
}

function getLabRequest(command, callback) {
  if (!command.hasOwnProperty('entities')) return null;
  command.entities.forEach(function (entity) {
    if (entity.source === "Conversation" && entity.type === "vitals")
      callback(util.format("I've added a test for %s for the next appointment.", entity.text));
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
    callback(util.format("follow up with %s between %s and %s.", caregiver,from,to))
  else if (from !== null)
    callback(util.format("follow up with %s on %s.", caregiver,from))
  else
    callback(util.format("will schedule a follow up appointment with %s.", caregiver))

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

responses.forEach(function (response) {
  console.dir(response);
  generateResponse(response, resp => {
    console.log("Response: " + resp);
  });
})
