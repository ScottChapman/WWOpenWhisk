var ConversationV1 = require('watson-developer-cloud/conversation/v1');
var fs = require('fs');

var conversation = new ConversationV1({
	  username: "580bd350-bfce-4a58-b52e-afd67b58e786",
	  password: "WUB54wjHNCTU" ,
	  version_date: '2017-02-03'
});

var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('samples.txt')
});

lineReader.on('line', function (text) {
  console.log('Line from file:', text);
	conversation.message({
		input: { text: text },
		  workspace_id: 'b147d830-7c9d-437a-b8e2-a8d73928a7e1',
		  alternate_intents: true
		 }, function(err, response) {
		     if (err) {
				    console.error(err);
				  } else {
				    // console.log(JSON.stringify(response, null, 2));
				    console.log("Intents: " + JSON.stringify(response.intents, null, 2));
				    console.log("Entities: " + JSON.stringify(response.entities, null, 2));
				  }
		 });
});
