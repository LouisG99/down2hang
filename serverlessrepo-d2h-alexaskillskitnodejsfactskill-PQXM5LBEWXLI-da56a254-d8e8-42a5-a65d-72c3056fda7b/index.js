const invocationName = "down to hang";

const languageStrings = {
  'en': {
    'translation': {
      'WELCOME1': 'Welcome to down to hang!',
      'WELCOME2': 'Greetings!',
      'WELCOME3': 'Hello there!',
      'HELP': 'You can say help, stop, or cancel. ',
      'STOP': 'Goodbye!'
    }
  }
  // , 'de-DE': { 'translation' : { 'WELCOME'   : 'German Welcome etc.' } }
  // , 'jp-JP': { 'translation' : { 'WELCOME'   : 'Japanese Welcome etc.' } }
};
const APP_ID = 'amzn1.ask.skill.92467103-a5d0-46b4-a4ef-95051c840adc';  // TODO replace with your app ID (OPTIONAL).

const Alexa = require("alexa-sdk");
const https = require("https");
const AWS = require("aws-sdk");
const dynamodb_doc = require("dynamodb-doc");


module.exports.handler = function (event, context, callback) {
  let alexa = Alexa.handler(event, context);
  alexa.appId = APP_ID; // 

  alexa.resources = languageStrings;
  alexa.registerHandlers(handlers);
  alexa.execute();
}

const handlers = {
  'AMAZON.NavigateHomeIntent': function () {
    let say = 'Hello from AMAZON.NavigateHomeIntent. ';

    this.response
      .speak(say)
      .listen('try again, ' + say);

    this.emit(':responseReady');
  },
  'AMAZON.CancelIntent': function () {

    let say = 'Goodbye.';
    this.response
      .speak(say);

    this.emit(':responseReady');
  },
  'AMAZON.HelpIntent': function () {

    var CustomIntents = getCustomIntents();
    var MyIntent = randomPhrase(CustomIntents);
    let say = 'Out of ' + CustomIntents.length + ' intents, here is one called, ' + MyIntent.name + ', just say, ' + MyIntent.samples[0];
    this.response
      .speak(say)
      .listen('try again, ' + say)
      .cardRenderer('Intent List', cardIntents(CustomIntents)); // , welcomeCardImg

    this.emit(':responseReady');
  },
  'AMAZON.StopIntent': function () {

    let say = 'Goodbye.';
    this.response
      .speak(say);

    this.emit(':responseReady');
  },
  'AMAZON.YesIntent': function () {
    let say = 'Hello from AMAZON.YesIntent. ';

    this.response
      .speak(say)
      .listen('try again, ' + say);


    this.emit(':responseReady');
  },
  'AMAZON.NoIntent': function () {
    let say = 'Hello from AMAZON.NoIntent. ';

    this.response
      .speak(say)
      .listen('try again, ' + say);


    this.emit(':responseReady');
  },
  'FindAvailableFriends': function () {
    let docClient = new AWS.DynamoDB.DocumentClient();

    let say = '';
    let slotStatus = '';
    let groupName = null;

    if (this.event.request.intent.slots.group.value) {
      const group = this.event.request.intent.slots.group;
      slotStatus += ' slot group was heard as ' + group.value + '. ';
      groupName = resolveCanonical(group).toLowerCase();

      if (groupName != group.value) {
        slotStatus += ' which resolved to ' + groupName;
      }
    } else {
      slotStatus += ' slot group is empty. ';
    }

    if (groupName === null) {
      say = "Please give me a valid group name";
      this.response
        .speak(say)
        .listen('try again, ' + say);

      this.emit(':responseReady');
      return;
    }

    let groupMembers = null;
    let paramsGroupGet = {
      TableName: "Groups",
      FilterExpression: '#u_name = :val',
      ExpressionAttributeNames: { '#u_name': 'Name' },
      ExpressionAttributeValues: { ':val': groupName }
    }

    docClient.scan(paramsGroupGet).promise()
    .then(groupData => { // assume data.size() == 1
      groupMembers = new Set(groupData.Items[0]['Members']);
    },
    err => {
      console.log(err);
      say = "error happened, group probably doesn't exist";
    })
    .then(() => {
      let paramsUsersGet = { //query who is free from this list
        TableName: "d2hTable",
        FilterExpression: '#u_free = :val',
        ExpressionAttributeNames: { '#u_free': 'Free' },
        ExpressionAttributeValues: { ':val': true }
      };
      
      return docClient.scan(paramsUsersGet).promise();
    })
    .then(data => {
      console.log(data);
      const userId = this.event['session']['user']['userId'];
      say = `The following people from the ${groupName} group are down to hang right now: `;
      data.Items.forEach(function (item) {
        if (item['User'] !== userId && groupMembers.has(item['User'])) {
          say += item['Name'] + ', ';
        }
      });
    },
    err => {
      console.log(err);
      say = "error happened, user probably doesn't exist";
    })
    .then(() => {
      this.response.speak(say).listen('try again, ' + say);
      this.emit(':responseReady');
    });
  },
  'ChangeAvailability': function () {
    let docClient = new AWS.DynamoDB.DocumentClient();
    let say = 'Hello from ChangeAvailability. ';
    let availabilitySlotStatus = '';
    let resolvedSlot = null;

    if (this.event.request.intent.slots.availability.value) {
      const availability = this.event.request.intent.slots.availability;
      availabilitySlotStatus += ' slot availability was heard as ' + availability.value + '. ';
      resolvedSlot = resolveCanonical(availability);
      if (resolvedSlot != availability.value) {
        availabilitySlotStatus += ' which resolved to ' + resolvedSlot;
      }
    } else {
      availabilitySlotStatus += ' slot availability is empty. ';
    }

    if (resolvedSlot) {
      const userId = this.event['session']['user']['userId'];
      const isFree = resolvedSlot !== 'busy';

      const params = {
        TableName: 'd2hTable',
        Key: { "User": userId },
        UpdateExpression: "SET #u_free = :is_free",
        ExpressionAttributeNames: { '#u_free': 'Free' },
        ExpressionAttributeValues: { ":is_free": isFree },
        ReturnValues: "UPDATED_NEW"
      }

      docClient.update(params).promise()
        .then(data => {
          console.log(data);
          say = "your availability was updated to " + isFree;
          this.response.speak(say).listen('try again, ' + say);
          this.emit(':responseReady');
        },
          err => {
            console.log(err);
            say = "error happeened";
          });
    }
    else {
      say = "I'm sorry I don't know what you mean, please reformulate";
      this.response.speak(say).listen('try again, ' + say);
      this.emit(':responseReady');
    }
  },
  'RegisterMe': function () {
    let say = '';
    let docClient = new AWS.DynamoDB.DocumentClient();
    var resolvedSlot;

    if (this.event.request.intent.slots.name.value) {
      const userId = this.event.session.user.userId
      const name = this.event.request.intent.slots.name;

      resolvedSlot = resolveCanonical(name);

      let params = {
        TableName: "d2hTable",
        Item: {
          "User": userId,
          "Name": resolvedSlot, 
          "Groups": []
        }
      };

      docClient.put(params).promise()
      .then(data => {
        console.log('Inserted Row Data');
        console.log(data);
        say += `${resolvedSlot} has been added to the registry! `;

        this.response.speak(say).listen('try again, ' + say);
        this.emit(':responseReady');
      },
        err => {
          console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
        }
      );

    } else {
      say += ' Sorry, I didn\'t catch your name ';
      this.response.speak(say).listen('try again, ' + say);
      this.emit(':responseReady');
    }
  },
  'CreateGroup': function () {
    let say = '';
    let slotStatus = '';
    let groupName = null;

    if (this.event.request.intent.slots.group.value) {
      const group = this.event.request.intent.slots.group;
      slotStatus += ' slot group was heard as ' + group.value + '. ';
      groupName = resolveCanonical(group).toLowerCase();

      if (groupName != group.value) {
        slotStatus += ' which resolved to ' + groupName;
      }
    } else {
      slotStatus += ' slot group is empty. ';
    }

    if (groupName === null) {
      say = "Please give me a valid group name";
      this.response
        .speak(say)
        .listen('try again, ' + say);

      this.emit(':responseReady');
    } else {
      // create group in GROUPs table

      let docClient = new AWS.DynamoDB.DocumentClient();
      let params = {
        TableName: "Groups",
        Item: {
          "Name": groupName,
          "Members": [] // add current user later in this function
        }
      };

      docClient.put(params).promise() //adding to Groups Table
        .then(data => {
          console.log('Inserted Row Data');
          console.log(data);
          say += `The ${groupName} group was created! `;
        },
          err => {
            console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
          }
        )
        .then(() => {
          this.response.speak(say).listen('try again, ' + say);
          this.emit(':responseReady');
        });

      //add to the list of groups in USERS TABLE
    }
  },
  'LeaveGroup': function () {
    let say = 'Hello from LeaveGroup. ';

    var slotStatus = '';
    var groupName;

    //   SLOT: group 
    if (this.event.request.intent.slots.group.value) {
      const group = this.event.request.intent.slots.group;
      slotStatus += ' slot group was heard as ' + group.value + '. ';

      groupName = resolveCanonical(group);

      if (groupName != group.value) {
        slotStatus += ' which resolved to ' + groupName;
      }
    } else {
      slotStatus += ' slot group is empty. ';
    }

    // TODO: Business Logic
    // Remove self from group table
    // remove group from self
    if (groupName) {

    }


    say += slotStatus;

    this.response
      .speak(say)
      .listen('try again, ' + say);


    this.emit(':responseReady');
  },
  'JoinGroup': function () {
    let say = '';
    let slotStatus = '';
    let groupName = null;

    if (this.event.request.intent.slots.group.value) {
      const group = this.event.request.intent.slots.group;
      slotStatus += ' slot group was heard as ' + group.value + '. ';
      groupName = resolveCanonical(group).toLowerCase();

      if (groupName != group.value) {
        slotStatus += ' which resolved to ' + groupName;
      }
    } else {
      slotStatus += ' slot group is empty. ';
    }

    if (groupName === null) {
      say = "Please give me a valid group name";
      this.response
        .speak(say)
        .listen('try again, ' + say);

      this.emit(':responseReady');
    } else {
      const userId = this.event['session']['user']['userId'];
      let docClient = new AWS.DynamoDB.DocumentClient();
      const paramsUserUpdate = {
        TableName: 'd2hTable',
        Key: { "User": userId },
        UpdateExpression: "SET #u_groups = list_append(#u_groups, :u_groupName)",
        ExpressionAttributeValues: { ':u_groupName': [groupName] },
        ExpressionAttributeNames: { '#u_groups': 'Groups' },
        ReturnValues: "UPDATED_NEW"
      };
      const paramsGroupsUpdate = {
        TableName: 'Groups',
        Key: { "Name": groupName },
        UpdateExpression: "SET #u_members = list_append(#u_members, :u_userId)",
        ExpressionAttributeValues: { ':u_userId': [userId] },
        ExpressionAttributeNames: { '#u_members': 'Members' },
        ReturnValues: "UPDATED_NEW"
      };

      docClient.update(paramsGroupsUpdate).promise() // add to "Groups" list in d2htable (users)
      .then(data => {
        console.log(data);
        return docClient.update(paramsUserUpdate).promise();
      },
      err => {
        console.log(err);
        say = "error happened, group probably doesn't exist";
      })
      .then(data => {
        console.log(data);
        say = `You've been added to group ${groupName}`;
      },
      err => {
        console.log(err);
        say = "error happened, user probably doesn't exits or doesn't have groups lisy";
      })
      .then(() => {
        this.response.speak(say).listen('try again, ' + say);
        this.emit(':responseReady');
      });
    }
  },
  'LaunchRequest': function () {
    let say = this.t('WELCOME1') + ' ' + this.t('HELP');
    this.response
      .speak(say)
      .listen('try again, ' + say);

    this.emit(':responseReady');
  },
  'Unhandled': function () {
    let say = 'The skill did not quite understand what you wanted.  Do you want to try something else? ';
    this.response
      .speak(say)
      .listen(say);
  }
};
//  ------ Helper Functions -----------------------------------------------

function randomPhrase(myArray) {
  return (myArray[Math.floor(Math.random() * myArray.length)]);
}

// returns slot resolved to an expected value if possible
function resolveCanonical(slot) {
  try {
    var canonical = slot.resolutions.resolutionsPerAuthority[0].values[0].value.name;
  } catch (err) {
    console.log(err.message);
    var canonical = slot.value;
  };
  return canonical;
};

// used to emit :delegate to elicit or confirm Intent Slots
function delegateSlotCollection() {
  console.log("current dialogState: " + this.event.request.dialogState);
  if (this.event.request.dialogState === "STARTED") {
    var updatedIntent = this.event.request.intent;

    this.emit(":delegate");

  } else if (this.event.request.dialogState !== "COMPLETED") {

    this.emit(":delegate");

  } else {
    console.log("returning: " + JSON.stringify(this.event.request.intent));

    return this.event.request.intent;
  }
}

function getCustomIntents() {
  var customIntents = [];
  for (let i = 0; i < intentsReference.length; i++) {
    if (intentsReference[i].name.substring(0, 7) != "AMAZON." && intentsReference[i].name !== "LaunchRequest") {
      customIntents.push(intentsReference[i]);
    }
  }
  return (customIntents);
}
function cardIntents(iArray) {
  var body = ""; for (var i = 0; i < iArray.length; i++) {
    body += iArray[i].name + "\n";
    body += "  '" + iArray[i].samples[0] + "'\n";
  }
  return (body);
}

const welcomeCardImg = {
  smallImageUrl: "https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/alexa-devs-skill/cards/skill-builder-720x480._TTH_.png",
  largeImageUrl: "https://m.media-amazon.com/images/G/01/mobile-apps/dex/alexa/alexa-skills-kit/alexa-devs-skill/cards/skill-builder-1200x800._TTH_.png"
};


// *********************************** 
// ** Helper functions from 
// ** These should not need to be edited 
// ** www.github.com/alexa/alexa-cookbook 
// *********************************** 

// *********************************** 
// ** Route to Intent 
// *********************************** 

// after doing the logic in new session, 
// route to the proper intent 

function routeToIntent() {

  switch (this.event.request.type) {
    case 'IntentRequest':
      this.emit(this.event.request.intent.name);
      break;
    case 'LaunchRequest':
      this.emit('LaunchRequest');
      break;
    default:
      this.emit('LaunchRequest');
  }
}
// *********************************** 
// ** Dialog Management 
// *********************************** 

function getSlotValues(filledSlots) {
  //given event.request.intent.slots, a slots values object so you have 
  //what synonym the person said - .synonym 
  //what that resolved to - .resolved 
  //and if it's a word that is in your slot values - .isValidated 
  let slotValues = {};

  console.log('The filled slots: ' + JSON.stringify(filledSlots));
  Object.keys(filledSlots).forEach(function (item) {
    //console.log("item in filledSlots: "+JSON.stringify(filledSlots[item])); 
    var name = filledSlots[item].name;
    //console.log("name: "+name); 
    if (filledSlots[item] &&
      filledSlots[item].resolutions &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0] &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {

      switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
        case "ER_SUCCESS_MATCH":
          slotValues[name] = {
            "synonym": filledSlots[item].value,
            "resolved": filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name,
            "isValidated": true
          };
          break;
        case "ER_SUCCESS_NO_MATCH":
          slotValues[name] = {
            "synonym": filledSlots[item].value,
            "resolved": filledSlots[item].value,
            "isValidated": false
          };
          break;
      }
    } else {
      slotValues[name] = {
        "synonym": filledSlots[item].value,
        "resolved": filledSlots[item].value,
        "isValidated": false
      };
    }
  }, this);
  //console.log("slot values: "+JSON.stringify(slotValues)); 
  return slotValues;
}
// This function delegates multi-turn dialogs to Alexa. 
// For more information about dialog directives see the link below. 
// https://developer.amazon.com/docs/custom-skills/dialog-interface-reference.html 
function delegateSlotCollection() {
  console.log("in delegateSlotCollection");
  console.log("current dialogState: " + this.event.request.dialogState);

  if (this.event.request.dialogState === "STARTED") {
    console.log("in STARTED");
    console.log(JSON.stringify(this.event));
    var updatedIntent = this.event.request.intent;
    // optionally pre-fill slots: update the intent object with slot values 
    // for which you have defaults, then return Dialog.Delegate with this 
    // updated intent in the updatedIntent property 

    disambiguateSlot.call(this);
    console.log("disambiguated: " + JSON.stringify(this.event));
    this.emit(":delegate", updatedIntent);
  } else if (this.event.request.dialogState !== "COMPLETED") {
    console.log("in not completed");
    //console.log(JSON.stringify(this.event)); 

    disambiguateSlot.call(this);
    this.emit(":delegate", updatedIntent);
  } else {
    console.log("in completed");
    //console.log("returning: "+ JSON.stringify(this.event.request.intent)); 
    // Dialog is now complete and all required slots should be filled, 
    // so call your normal intent handler. 
    return this.event.request.intent.slots;
  }
  return null;
}
// If the user said a synonym that maps to more than one value, we need to ask 
// the user for clarification. Disambiguate slot will loop through all slots and 
// elicit confirmation for the first slot it sees that resolves to more than 
// one value. 
function disambiguateSlot() {
  let currentIntent = this.event.request.intent;

  Object.keys(this.event.request.intent.slots).forEach(function (slotName) {
    let currentSlot = this.event.request.intent.slots[slotName];
    let slotValue = slotHasValue(this.event.request, currentSlot.name);
    if (currentSlot.confirmationStatus !== 'CONFIRMED' &&
      currentSlot.resolutions &&
      currentSlot.resolutions.resolutionsPerAuthority[0]) {

      if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code == 'ER_SUCCESS_MATCH') {
        // if there's more than one value that means we have a synonym that 
        // mapped to more than one value. So we need to ask the user for 
        // clarification. For example if the user said "mini dog", and 
        // "mini" is a synonym for both "small" and "tiny" then ask "Did you 
        // want a small or tiny dog?" to get the user to tell you 
        // specifically what type mini dog (small mini or tiny mini). 
        if (currentSlot.resolutions.resolutionsPerAuthority[0].values.length > 1) {
          let prompt = 'Which would you like';
          let size = currentSlot.resolutions.resolutionsPerAuthority[0].values.length;
          currentSlot.resolutions.resolutionsPerAuthority[0].values.forEach(function (element, index, arr) {
            prompt += ` ${(index == size - 1) ? ' or' : ' '} ${element.value.name}`;
          });

          prompt += '?';
          let reprompt = prompt;
          // In this case we need to disambiguate the value that they 
          // provided to us because it resolved to more than one thing so 
          // we build up our prompts and then emit elicitSlot. 
          this.emit(':elicitSlot', currentSlot.name, prompt, reprompt);
        }
      } else if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code == 'ER_SUCCESS_NO_MATCH') {
        // Here is where you'll want to add instrumentation to your code 
        // so you can capture synonyms that you haven't defined. 
        console.log("NO MATCH FOR: ", currentSlot.name, " value: ", currentSlot.value);

        if (REQUIRED_SLOTS.indexOf(currentSlot.name) > -1) {
          let prompt = "What " + currentSlot.name + " are you looking for";
          this.emit(':elicitSlot', currentSlot.name, prompt, prompt);
        }
      }
    }
  }, this);
}

// Given the request an slot name, slotHasValue returns the slot value if one 
// was given for `slotName`. Otherwise returns false. 
function slotHasValue(request, slotName) {

  let slot = request.intent.slots[slotName];

  //uncomment if you want to see the request 
  //console.log("request = "+JSON.stringify(request)); 
  let slotValue;

  //if we have a slot, get the text and store it into speechOutput 
  if (slot && slot.value) {
    //we have a value in the slot 
    slotValue = slot.value.toLowerCase();
    return slotValue;
  } else {
    //we didn't get a value in the slot. 
    return false;
  }
}
// End Skill Code
// Language Model  for reference
var interactionModel = [
  {
    "name": "AMAZON.NavigateHomeIntent",
    "samples": []
  },
  {
    "name": "AMAZON.CancelIntent",
    "samples": []
  },
  {
    "name": "AMAZON.HelpIntent",
    "samples": []
  },
  {
    "name": "AMAZON.StopIntent",
    "samples": []
  },
  {
    "name": "AMAZON.YesIntent",
    "samples": []
  },
  {
    "name": "AMAZON.NoIntent",
    "samples": []
  },
  {
    "name": "FindAvailableFriends",
    "slots": [
      {
        "name": "group",
        "type": ""
      }
    ],
    "samples": [
      "who in {group} is free",
      "who's available",
      "who's free",
      "whomst's down to hang",
      "who is trying to bool",
      "who wants to chill",
      "who is willing to hang",
      "Who is available",
      "Who's down to hang",
      "Which of my friends are free"
    ]
  },
  {
    "name": "ChangeAvailability",
    "slots": [
      {
        "name": "availability",
        "type": "availability"
      },
      {
        "name": "startTime",
        "type": "AMAZON.TIME"
      },
      {
        "name": "endTime",
        "type": "AMAZON.TIME"
      }
    ],
    "samples": [
      "Tell everyone that I am {availability}",
      "tell my friends that I am {availability} right now",
      "change my availability to {availability}",
      "im {availability}",
      "i {availability}",
      "I'm {availability} now",
      "set my status to {availability}"
    ]
  },
  {
    "name": "RegisterMe",
    "slots": [
      {
        "name": "name",
        "type": "AMAZON.US_FIRST_NAME"
      }
    ],
    "samples": [
      "add {name} to registry",
      "register {name} into the system",
      "add me into the system as {name}",
      "register {name}",
      "add {name} to system"
    ]
  },
  {
    "name": "CreateGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "create new friend circle {group} ",
      "start a new group named {group}",
      "start new friend group called {group}",
      "create group {group} "
    ]
  },
  {
    "name": "LeaveGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "leave {group} group",
      "leave {group}",
      "remove me from {group}",
      "leave group {group}"
    ]
  },
  {
    "name": "JoinGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "join the group {group}",
      "add me to {group}",
      "join {group} "
    ]
  },
  {
    "name": "LaunchRequest"
  }
];
var intentsReference = [
  {
    "name": "AMAZON.NavigateHomeIntent",
    "samples": []
  },
  {
    "name": "AMAZON.CancelIntent",
    "samples": []
  },
  {
    "name": "AMAZON.HelpIntent",
    "samples": []
  },
  {
    "name": "AMAZON.StopIntent",
    "samples": []
  },
  {
    "name": "AMAZON.YesIntent",
    "samples": []
  },
  {
    "name": "AMAZON.NoIntent",
    "samples": []
  },
  {
    "name": "FindAvailableFriends",
    "slots": [
      {
        "name": "group",
        "type": ""
      }
    ],
    "samples": [
      "who in {group} is free",
      "who's available",
      "who's free",
      "whomst's down to hang",
      "who is trying to bool",
      "who wants to chill",
      "who is willing to hang",
      "Who is available",
      "Who's down to hang",
      "Which of my friends are free"
    ]
  },
  {
    "name": "ChangeAvailability",
    "slots": [
      {
        "name": "availability",
        "type": "availability"
      },
      {
        "name": "startTime",
        "type": "AMAZON.TIME"
      },
      {
        "name": "endTime",
        "type": "AMAZON.TIME"
      }
    ],
    "samples": [
      "Tell everyone that I am {availability}",
      "tell my friends that I am {availability} right now",
      "change my availability to {availability}",
      "im {availability}",
      "i {availability}",
      "I'm {availability} now",
      "set my status to {availability}"
    ]
  },
  {
    "name": "RegisterMe",
    "slots": [
      {
        "name": "name",
        "type": "AMAZON.US_FIRST_NAME"
      }
    ],
    "samples": [
      "add {name} to registry",
      "register {name} into the system",
      "add me into the system as {name}",
      "register {name}",
      "add {name} to system"
    ]
  },
  {
    "name": "CreateGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "create new friend circle {group} ",
      "start a new group named {group}",
      "start new friend group called {group}",
      "create group {group} "
    ]
  },
  {
    "name": "LeaveGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "leave {group} group",
      "leave {group}",
      "remove me from {group}",
      "leave group {group}"
    ]
  },
  {
    "name": "JoinGroup",
    "slots": [
      {
        "name": "group",
        "type": "group_names"
      }
    ],
    "samples": [
      "join the group {group}",
      "add me to {group}",
      "join {group} "
    ]
  },
  {
    "name": "LaunchRequest"
  }
];
