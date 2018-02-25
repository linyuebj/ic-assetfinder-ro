"use strict";
// --------------------------------------------------------------------------
// Require statements
// --------------------------------------------------------------------------
var express = require("express");
var bodyParser = require("body-parser");
var request = require("request");
var requestjs = require("request-json");
var crypto = require("crypto");

var xml2js = require("xml2js");
var parser = new xml2js.Parser();
var auth = require('basic-auth');

const fs = require('fs');
//var moment = require('moment');

var APP_ID = "67??";
var APP_SECRET = "ab??";
var APP_WEBHOOK_SECRET = "hi??";

var CONNECTIONS_HOTNAME = "https://apps.na.collabserv.com";
var CONNECTIONS_USER = "fadams@demo.ibmcollab.com";
var CONNECTIONS_PASSWORD = "??";

// --------------------------------------------------------------------------
// Setup global variables
// --------------------------------------------------------------------------
var textBreakGQL = "\\r\\n";
var textBreak = "\r\n";

// Workspace API Setup - fixed stuff
const WWS_URL = "https://api.watsonwork.ibm.com";
const AUTHORIZATION_API = "/oauth/token";
const OAUTH_ENDPOINT = "/oauth/authorize";
const WEBHOOK_VERIFICATION_TOKEN_HEADER = "X-OUTBOUND-TOKEN".toLowerCase();

// --------------------------------------------------------------------------
// Setup the express server
// --------------------------------------------------------------------------
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + "/public"));

// create application/json parser
var jsonParser = bodyParser.json();

// --------------------------------------------------------------------------
// Express Server runtime
// --------------------------------------------------------------------------
// Start our server !
app.listen(process.env.PORT || 3000, function() {
    console.log("INFO: app is listening on port %s", (process.env.PORT || 3000));
});

// --------------------------------------------------------------------------
// Webhook entry point
app.post("/callback", jsonParser, function(req, res) {
    // Check if we have all the required variables
    if (!APP_ID || !APP_SECRET || !APP_WEBHOOK_SECRET) {
        console.log("ERROR: Missing variables APP_ID, APP_SECRET or WEBHOOK_SECRET from environment");
        return;
    }

    // Handle Watson Work Webhook verification challenge
    if (req.body.type === 'verification') {
        console.log('Got Webhook verification challenge ' + JSON.stringify(req.body));
        console.log('UserID ' +req.body.userId);


        var bodyToSend = {
            response: req.body.challenge
        };

        var hashToSend = crypto.createHmac('sha256', APP_WEBHOOK_SECRET).update(JSON.stringify(bodyToSend)).digest('hex');

        res.set('X-OUTBOUND-TOKEN', hashToSend);
        res.send(bodyToSend);
        return;
    }

    handleCalbackRequest(req, res);

    return;


});

function handleCalbackRequest(req, res){
  console.log("userId =", req.body.userId);

  // Ignore all our own messages
  if (req.body.userId === APP_ID) {
      console.log("Message from myself : abort");
      res.status(200).end();
      return;
  }

  // Ignore empty messages
  if (req.body.content === "") {
      console.log("Empty message : abort");
      res.status(200).end();
      return;
  }

  // Get the event type
  var eventType = req.body.type;

  // Get the spaceId
  var spaceId = req.body.spaceId;

  // Acknowledge we received and processed notification to avoid getting
  // sent the same event again
  res.status(200).end();

  // Act only on the events we need
  if (eventType === "message-annotation-added") {
    var annotationType = req.body.annotationType;
    var annotationPayload = JSON.parse(req.body.annotationPayload);

    // Action fulfillment callback - When user clicks and engages with App
    if (annotationType === "actionSelected") {
      var userName = req.body.userName;
      console.log("------- AF -------------------------------")
      console.log("%s clicked on an action link.", userName);

      // Extract the necessary info
      var targetUserId = req.body.userId;
      var conversationId = annotationPayload.conversationId;
      var targetDialogId = annotationPayload.targetDialogId;
      var referralMessageId = annotationPayload.referralMessageId;
      var actionId = annotationPayload.actionId;
      console.log("Action : %s", actionId);
      console.log("Referral Message Id : %s", referralMessageId);


      // Ignore all our own messages
      if (req.body.userId === APP_ID) {
          console.log("Message from myself : abort");
          res.status(200).end();
          return;
      }

      var gqlmessage = "query getMessage {message(id: \"" + referralMessageId + "\") {annotations}}";
      // First click on underlined message
      if (actionId.startsWith("SalesKit")) {
          // We first need to get back the annotations of the originating message to get the possible search terms.
          getJWTToken(APP_ID, APP_SECRET, function(accessToken) {
              console.log("getJWTToken OK");
              callGraphQL(accessToken, gqlmessage, function(error, bodyParsed, accessToken) {
                if (!error) {
                  var msgannotations = bodyParsed.data.message.annotations;

                  // Loop over all the annotations and get the one we need
                  for (var i = 0; i < msgannotations.length; i++) {
                    var ann = JSON.parse(msgannotations[i]);
                    console.log("Annotation Type: "+ann.type);
                    // React on message-focus to catch the expert query
                    if ((ann.type === "message-focus") && (ann.applicationId === APP_ID)) {
                      // Get the lens of the focus
                      var lens = ann.lens;

                      // Only react on lens 'demo-asset'
                      console.log("Received Demo Asset Query : " + ann.phrase);

                      var confidence = ann.confidence;
                      var extractedInfo = ann.extractedInfo;
                      var entities = extractedInfo.entities;
                      var arrayLength = entities.length;
                      var product = "";
                      var asset = lens;

                      console.log('ArrayLenght: '+arrayLength);
                      for (var j = 0; j < arrayLength; j++) {
                          if (entities[j].type === "product"){
                            product = entities[j].text;
                          }
                      }

                      console.log("Confidence: "+confidence+" - Product: "+product+" - AssetType: "+asset);

                        // Preparing the dialog message
                        var afgraphql1 = "mutation {createTargetedMessage(input: {conversationId: \"" + conversationId + "\" targetUserId: \"" + targetUserId + "\" targetDialogId: \"" + targetDialogId + "\" attachments: [";
                        var afgraphql3 = "]}){successful}}";
                        var afgraphql2 = "";
                        var cardtitle = "";
                        var cardsubtitle = "Sales Assets";
                        var cardtext = "";

                        var carddate = "1500573338000";
                        var buttontext = "Share to Space";
                        var buttonpayload = "SHARE-";
                        var buttontext2 = "View Details";
                        var buttonpayload2 = "DETAILS-";

                        queryConnectionsAssets(product, asset, function(error, files) {
                          if (files!=null) {
                              console.log('Connections Executed - Creating Card now');
                              console.log('Result Entries lenght: '+files.resultcount);
                              var assetName = "";
                              var assetType = "";
                              var assetDesc = "";
                              var assetPreviewURL = "";
                              var assetCommentsCount = "";
                              var assetRecommendationCount = "";
                              var assetId = "";
                              var assetCreatedBy = "";

                              for (var x = 0; x < files.resultcount; x++) {
                                    assetName = files.results[x].title;
                                    assetCreatedBy = files.results[x].author;
                                    assetDesc = "";
                                    assetId = files.results[x].id;
                                    assetPreviewURL = files.results[x].link;
                                    assetCommentsCount = files.results[x].comments;
                                    assetRecommendationCount = files.results[x].recommendations;

                                    cardsubtitle = assetCreatedBy;


                                    if (x>0){
                                      afgraphql2+=",";
                                    }
                                    cardtitle = assetName;
                                    cardtext = assetDesc;

                                    //cardtext += "[Preview URL]("+assetPreviewURL+")";
                                    buttonpayload = "SHARE-"+assetId;
                                    buttonpayload2 = "DETAILS-"+assetId;
                                    afgraphql2 += "{type:CARD, cardInput:{type:INFORMATION, informationCardInput: {title: \"" + cardtitle + "\", subtitle: \"" + cardsubtitle + "\", text: \"" + cardtext + "\", date: \"" + carddate + "\", buttons: [{text: \"" + buttontext2 + "\", payload: \"" + buttonpayload2 + "\", style: PRIMARY}]}}}";
                              }
                              var afgraphql = afgraphql1 + afgraphql2 + afgraphql3;
                              console.log("Calling PostAFMessage");
                              console.log("afgraphql: "+afgraphql);
                              postActionFulfillmentMessage(accessToken, afgraphql, function(err, accessToken) {
                                if (err) {
                                  console.log("Unable to post custom message to space.");
                                }
                                return;
                              });

                          } else {
                              console.log('Error received by Call Connections function');
                              console.log('Product: '+product+" - Asset: "+asset);
                              afNotFound(conversationId, targetUserId, targetDialogId, spaceId, asset, product);
                          }
                        });



                    }
                  }
                }
              })

          })
        }
        else if (actionId.startsWith("DETAILS")) {
           // Get the searchwords from the actionId
           //var assetType = actionId.slice(8, 9);
           var assetId = actionId.slice(8, actionId.length);
           console.log("AF received DETAILS for : ");
           queryAssetByIdConnections(assetId, function(error, result) {
             if (!error) {
                 console.log('Box Executed - Creating Details now');
                 afDetails(conversationId, targetUserId, targetDialogId, spaceId, result);
               }
            });

         //afShare(conversationId, targetUserId, targetDialogId, spaceId, cardID);
        }
        else if (actionId.startsWith("SHARE")) {
           // Get the searchwords from the actionId
           //var assetType = actionId.slice(6, 7);
           var assetId = actionId.slice(6, actionId.length);
           console.log("AF received SHARE for : "+ assetId);
           queryAssetByIdConnections(assetId, function(error, result) {
             if (!error) {
                 console.log('Box Executed - Creating Share now');
                 afShare(conversationId, targetUserId, targetDialogId, spaceId, result, userName);
               }
            });

        }
    }
      return;
  }

  if (eventType === "message-created") {
      console.log("Message Created received.");
      return;
  }

  // We don't do anything else, so return.
  console.log("INFO: Skipping unwanted eventType: " + eventType);
  return;
}


// ------------------------------------------
// SHARE
// ------------------------------------------
function afShare(conversationId, targetUserId, targetDialogId, spaceId, files, userName) {
    var assetName = files.results[0].title;
    var assetId = files.results[0].id;
    var assetAuthor = files.results[0].author;
    var assetCommentsCount = files.results[0].comments;
    var assetRecommendationCount = files.results[0].recommendations;
    var assetPreviewURL = files.results[0].link;
    var assetDate = files.results[0].date;

    var countText = "*"+assetCommentsCount + " Comments - "+assetRecommendationCount+" Recommendations*";

    var finalAssetDate = new Date(assetDate).toLocaleString();

    var afgraphql1 = "mutation {createTargetedMessage(input: {conversationId: \"" + conversationId + "\" targetUserId: \"" + targetUserId + "\" targetDialogId: \"" + targetDialogId + "\" annotations: [{genericAnnotation: {title: \"Shared demo asset details !\" text: \"I've shared the details of the asset - " + assetName + " - to space.\" buttons: [";
    var afgraphql2 = "]}}]}){successful}}";

    var afgraphql = afgraphql1 + afgraphql2;

    // preparing the share message
    var messageName = userName+" shared: ";

    var demomessage = "*Asset* : " + assetName + textBreak;
    demomessage += "*Author* : " + assetAuthor + textBreak;
    demomessage += "*Created at* : " + finalAssetDate + textBreak;
    demomessage += countText + textBreak
    demomessage += "[Asset URL]("+assetPreviewURL+")";

    var messageTitle = "Sales Asset";

    // Send the dialog message
      getJWTToken(APP_ID, APP_SECRET, function(accessToken) {

        // Building the message to send to the space.
        var messageData = {
          type: "appMessage",
          version: 1.0,
          annotations: [
            {
              type: "generic",
              version: 1.0,
              color: "#0543D5",
              title: messageTitle,
              text: demomessage,
              actor: {
                name: messageName,
                avatar: "",
                url: ""
              }
            }
          ]
        };

        postCustomMessageToSpace(accessToken, spaceId, messageData, function(err, accessToken) {
          if (err) {
            console.log("Unable to post custom message to space. No sales asset shared.");
          }
        });

        postActionFulfillmentMessage(accessToken, afgraphql, function(err, accessToken) {
          return;
        });

    });
}

//+result.entries[0].shared_link.url
function afDetails(conversationId, targetUserId, targetDialogId, spaceId, files) {
  var assetName = files.results[0].title;
  var assetId = files.results[0].id;
  var assetAuthor = files.results[0].author;
  var assetCommentsCount = files.results[0].comments;
  var assetRecommendationCount = files.results[0].recommendations;
  var assetPreviewURL = files.results[0].link;
  var assetDate = files.results[0].date;


  var countText = " *"+assetCommentsCount + " Comments - "+assetRecommendationCount+" Recommendations*";

  var finalAssetDate = new Date(assetDate).toLocaleString();

  var text = "*Author* : " + assetAuthor + textBreakGQL;
  text += "*Created at* : " + finalAssetDate + textBreakGQL;
  //text += "*Description* : " + assetDesc + textBreakGQL;
  text += countText + textBreakGQL;
  //text +=  + textBreakGQL;
  text += "[Asset URL]("+assetPreviewURL+")";


  var afgraphql1 = "mutation {createTargetedMessage(input: {conversationId: \"" + conversationId + "\" targetUserId: \"" + targetUserId + "\" targetDialogId: \"" + targetDialogId + "\" annotations: [{genericAnnotation: {title: \""+assetName+"\" text: \"" + text + "\" buttons: [{postbackButton: {title: \"Share to Space\", id: \"SHARE-"+ assetId + "\", style: PRIMARY}}";
  var afgraphql2 = "]}}]}){successful}}";

  var afgraphql = afgraphql1 + afgraphql2;

  console.log("Detail GraphQL: "+afgraphql);

  getJWTToken(APP_ID, APP_SECRET, function(accessToken) {
    postActionFulfillmentMessage(accessToken, afgraphql, function(err, accessToken) {
      return;
    });
  });

}

function afNotFound(conversationId, targetUserId, targetDialogId, spaceId, asset, product) {
    var productDetails = "";
    if (product!=null){
      productDetails = "for this product"
    }

    var afgraphql1 = "mutation {createTargetedMessage(input: {conversationId: \"" + conversationId + "\" targetUserId: \"" + targetUserId + "\" targetDialogId: \"" + targetDialogId + "\" annotations: [{genericAnnotation: {title: \"Assets not available!\" text: \"Unfortunately, no "+asset+" assets available " + productDetails+ ".\" buttons: [";
    var afgraphql2 = "]}}]}){successful}}";

    var afgraphql = afgraphql1 + afgraphql2;

    // Send the dialog message
      getJWTToken(APP_ID, APP_SECRET, function(accessToken) {

        postActionFulfillmentMessage(accessToken, afgraphql, function(err, accessToken) {
          return;
        });

    });
}

function queryConnectionsAssets(product, assetType, callback) {
  var myData = {};
  // Build the GraphQL request
  console.log("Asset:"+assetType+" - Product:"+product);

  var queryURL = "";

  if (product===""){
    queryURL = "/search/atom/mysearch?constraint={\"type\": \"category\", \"values\":[\"Tag/"+assetType+"\"]}";
  } else {
    queryURL = "/search/atom/mysearch?constraint={\"type\": \"category\", \"values\":[\"Tag/"+assetType+"\"]}&social={\"type\":\"community\",\"id\":\""+product+"\"}";
  }

  var connectionsSearchURL = CONNECTIONS_HOTNAME + queryURL;

  console.log('QueryURL: '+queryURL);

  //var auth = "Basic "+ new Buffer(CONNECTIONS_USER+":"+CONNECTIONS_PASSWORD).toString("base64");

  request.get(connectionsSearchURL,function(error, response, body) {
    		//Check for error0052.
      	if (error) {
        		console.log("GetConnectionsFiles - Error:", error);
  			    callback(true,null);
      	}
      	//Check for right status code
      	if (response.statusCode !== 200) {
        		console.log("GetConnectionsFiles : Error :", response.statusCode);
        		callback(true,null);
      	}

        //console.log("result: "+body);

        parser.parseString(body, function(err, result) {
          if (err) {
            console.log("Connections Search : Error parsing xml:", error);
            return;
          }


          var resultcount = result.feed['openSearch:totalResults'][0];
          console.log("Connections Search : Found %s results", resultcount);
          myData.resultcount = resultcount;

          if (resultcount==="0"){
            console.log("GetConnectionsFiles : Error : Result Set Empty!");
            callback(true,null);
          }

          if (result.feed.entry) {
            // we have a result !
            var resultSet = result.feed.entry;
            var arrayLength = resultSet.length;
            var fileList = [];

            for (var i = 0; i < arrayLength; i++) {
              fileList.push({"id": resultSet[i].id[0],
                "title":resultSet[i].title[0]._,
                "link": resultSet[i].link[0].$.href,
                "author":resultSet[i].author[0].name[0],
                "comments":resultSet[i]['snx:rank'][0]._,
                "recommendations":resultSet[i]['snx:rank'][1]._
              });
            }

            myData.results = fileList;
          }

          // All done, let's go back
          callback(false, myData);
        });
      	//callback(false,JSON.parse(body));
  	}).auth(CONNECTIONS_USER, CONNECTIONS_PASSWORD);

}

function queryAssetByIdConnections(assetId, callback) {
  var myData = {};
  // Build the GraphQL request
  console.log("AssetId:"+assetId);

  var queryURL = "/search/atom/mysearch?constraint={\"type\": \"field\", \"id\":\"id\",\"values\":[\""+assetId+"\"]}";

  var connectionsSearchURL = CONNECTIONS_HOTNAME + queryURL;

  console.log('QueryURL: '+queryURL);

  //var auth = "Basic "+ new Buffer(CONNECTIONS_USER+":"+CONNECTIONS_PASSWORD).toString("base64");

  request.get(connectionsSearchURL,function(error, response, body) {
    		//Check for error0052.
      	if (error) {
        		console.log("GetConnectionsFiles - Error:", error);
  			    callback(true,null);
      	}
      	//Check for right status code
      	if (response.statusCode !== 200) {
        		console.log("GetConnectionsFiles : Error :", response.statusCode);
        		callback(true,null);
      	}

        //console.log("result: "+body);

        parser.parseString(body, function(err, result) {
          if (err) {
            console.log("CProfiles : Error parsing xml:", error);
            return;
          }
          var json1 = JSON.stringify(result);
          var json = JSON.parse(json1);
          console.log('test: '+json.feed.entry[0].id);

          console.log("title: "+result.feed.title[0]);
          var resultcount = result.feed['openSearch:totalResults'][0];
          console.log("CProfiles : Found %s results", resultcount);
          myData.resultcount = resultcount;

          if (result.feed.entry) {
            // we have a result !
            var resultSet = result.feed.entry;
            var arrayLength = resultSet.length;
            var fileList = [];

            for (var i = 0; i < arrayLength; i++) {
              fileList.push({"id": resultSet[i].id[0],
                "title":resultSet[i].title[0]._,
                "link": resultSet[i].link[0].$.href,
                "author":resultSet[i].author[0].name[0],
                "comments":resultSet[i]['snx:rank'][0]._,
                "recommendations":resultSet[i]['snx:rank'][1]._,
                "date":resultSet[i].updated[0]
              });
            }

            myData.results = fileList;
          }

          // All done, let's go back
          callback(false, myData);
        });
      	//callback(false,JSON.parse(body));
  	}).auth(CONNECTIONS_USER, CONNECTIONS_PASSWORD);

}


//--------------------------------------------------------------------------
//Post a custom message to a space
function postCustomMessageToSpace(accessToken, spaceId, messageData, callback) {
  var jsonClient = requestjs.createClient(WWS_URL);
  var urlToPostMessage = "/v1/spaces/" + spaceId + "/messages";
  jsonClient.headers.jwt = accessToken;

  // Calling IWW API to post message
  jsonClient.post(urlToPostMessage, messageData, function(err, jsonRes, jsonBody) {
    if (jsonRes.statusCode === 201) {
      console.log("Message posted to IBM Watson Workspace successfully!");
      callback(null, accessToken);
    } else {
      console.log("Error posting to IBM Watson Workspace !");
      console.log("Return code : " + jsonRes.statusCode);
      console.log(jsonBody);
      callback(err, accessToken);
    }
  });
}

//--------------------------------------------------------------------------
//Post an AF message to a space
function postActionFulfillmentMessage(accessToken, afgraphql, callback) {
  // Build the GraphQL request
  const GraphQLOptions = {
    "url": `${WWS_URL}/graphql`,
    "headers": {
      "Content-Type": "application/graphql",
      "x-graphql-view": "PUBLIC, BETA",
      "jwt": "${jwt}"
    },
    "method": "POST",
    "body": ""
  };

  GraphQLOptions.headers.jwt = accessToken;
  GraphQLOptions.body = afgraphql;

  //console.log(GraphQLOptions.body);
  request(GraphQLOptions, function(err, response, graphqlbody) {
    //console.log(graphqlbody);

    if (!err && response.statusCode === 200) {
      console.log("Status code === 200");
      var bodyParsed = JSON.parse(graphqlbody);
      callback(null, accessToken);
    } else if (response.statusCode !== 200) {
      console.log("ERROR: didn't receive 200 OK status, but :" + response.statusCode);
      var error = new Error("");
      callback(error, null, accessToken);
    } else {
      console.log("ERROR: Can't retrieve " + GraphQLOptions.body + " status:" + response.statusCode);
      callback(err, accessToken);
    }
  });
}

function callGraphQL(accessToken, graphQLbody, callback) {
  // Build the GraphQL request
  const GraphQLOptions = {
    "url": `${WWS_URL}/graphql`,
    "headers": {
      "Content-Type": "application/graphql",
      "x-graphql-view": "PUBLIC",
      "jwt": accessToken
    },
    "method": "POST",
    "body": ""
  };

  GraphQLOptions.headers.jwt = accessToken;
  GraphQLOptions.body = graphQLbody;

  // Create the space
  request(GraphQLOptions, function(err, response, graphqlbody) {
    if (!err && response.statusCode === 200) {
      //console.log(graphqlbody);
      var bodyParsed = JSON.parse(graphqlbody);
      callback(null, bodyParsed, accessToken);
    } else if (response.statusCode !== 200) {
      console.log("ERROR: didn't receive 200 OK status, but :" + response.statusCode);
      var error = new Error("");
      callback(error, null, accessToken);
    } else {
      console.log("ERROR: Can't retrieve " + GraphQLOptions.body + " status:" + response.statusCode);
      var error = new Error("");
      callback(error, null, accessToken);
    }
  });
}



//--------------------------------------------------------------------------
//Get an authentication token
function getJWTToken(userid, password, callback) {
    // Build request options for authentication.
    const authenticationOptions = {
        "method": "POST",
        "url": `${WWS_URL}${AUTHORIZATION_API}`,
        "auth": {
            "user": userid,
            "pass": password
        },
        "form": {
            "grant_type": "client_credentials"
        }
    };

    // Get the JWT Token
    request(authenticationOptions, function(err, response, authenticationBody) {

        // If successful authentication, a 200 response code is returned
        if (response.statusCode !== 200) {
            // if our app can't authenticate then it must have been
            // disabled. Just return
            console.log("ERROR: App can't authenticate");
            callback(null);
        }
        const accessToken = JSON.parse(authenticationBody).access_token;
        callback(accessToken);
    });
}

//--------------------------------------------------------------------------
//Post a message to a space
function postMessageToSpace(spaceId, accessToken, textMsg, callback) {
    var jsonClient = requestjs.createClient(WWS_URL);
    var urlToPostMessage = "/v1/spaces/" + spaceId + "/messages";
    jsonClient.headers.jwt = accessToken;

    var title = "";
    if (textMsg.substring(0, 10) === "It appears"){
        	title="I was listening and...";
    } else {
        	title="I was listening and you said ...";
    }

    // Building the message
    var messageData = {
        type: "appMessage",
        version: 1.0,
        annotations: [
            {
                type: "generic",
                version: 1.0,
                color: "#00B6CB",
                title: title,
                text: textMsg,
                actor: {
                    name: "Echobot",
                    avatar: "",
                    url: ""
                }
            }
        ]
    };

    // Calling IWW API to post message
    console.log("Message body : %s", JSON.stringify(messageData));

    jsonClient.post(urlToPostMessage, messageData, function(err, jsonRes, jsonBody) {
        if (jsonRes.statusCode === 201) {
            console.log("Message posted to IBM Watson Workspace successfully!");
            callback(true);
        } else {
            console.log("Error posting to IBM Watson Workspace !");
            console.log("Return code : " + jsonRes.statusCode);
            console.log(jsonBody);
            callback(false);
        }
    });

}
