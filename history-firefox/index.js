var self = require("sdk/self");
var data = require("sdk/self").data;
var tabs = require("sdk/tabs");
var manifest  = require("./package.json")
const { Cu, Cc, Ci } = require("chrome");
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"]
                        .getService(Ci.nsINavHistoryService);
Cu.importGlobalProperties(["fetch"]);

var local = require("sdk/simple-storage");
                        

/******************************************************************************
								LOCAL STORAGE
******************************************************************************/
function loadAddonData(){
	return new Promise((resolve, reject) => {
        if (local.storage.connect_history){
            resolve(local.storage.connect_history)
        } else {
            var addonData = {
				ID: Math.random().toString(36).substr(2, 9),
				lastPushAtTime: 0,
				pushedData: []
            }
            resolve(addonData)
        }
	})
}

function saveAddonData(addonData){
	local.storage.connect_history = addonData
}


/******************************************************************************
									UI
******************************************************************************/
var popup = require("sdk/panel").Panel({
  width: 520,
  height: 320,
  contentURL: data.url("popup.html"),
  contentScriptFile: data.url("popup.js"),
  onHide: handleHide
});
// Create a button
var addon_button = require("sdk/ui/button/toggle").ToggleButton({
  id: "show-history",
  label: "Connect History",
  icon: {
    "16": "./icon-16.png",
    "32": "./icon-32.png",
    "64": "./icon-64.png"
  },
  onClick: handleClick
});
// Handle click on extension's button
function handleClick(state){
    popup.show({position: addon_button});
}
function handleHide(){
  addon_button.state('window', {checked: false});
}

popup.on("show", function() {
  popup.port.emit("show", {manifest:manifest});
});

popup.port.on('doCommit', function(){
	loadAddonData()
	.then(addonData => collectHistory(addonData))
})

popup.port.on('doReset', function(){
  loadAddonData()
    .then(addonData => {
      addonData.pushedData = []
      addonData.lastPushAtTime = 0

      saveAddonData(addonData)
    })
})

popup.port.on('getData', function(){
    loadAddonData()
    .then(addonData => popup.port.emit('addonData', {addonData: addonData}))
})

popup.port.on('openTab', function(msg){
    tabs.open(msg.url);
})

/******************************************************************************
								QUERY HISTORY
******************************************************************************/
// Collect history and send to server
function collectHistory(addonData) {
	var options = historyService.getNewQueryOptions();
	var query = historyService.getNewQuery();
		// We collect only line with 'scope= and client_id=', i.e. OAuth and OIDC lines
		query.searchTerms="scope client_id", //will have some false positive
		query.beginTimeReference = query.TIME_RELATIVE_EPOCH;
		query.beginTime =  parseInt(addonData.lastPushAtTime*1000)// in microseconds (from firefox tutorial, not millis?)
		query.endTimeReference = query.TIME_RELATIVE_NOW;
		query.endTime = 0

	var scope_history = []

	// execute the query using the results by traversing a container
	var result = historyService.executeQuery(query, options);
	var cont = result.root;
	cont.containerOpen = true;

	for (var i = 0; i < cont.childCount; i ++) {
	    var url = cont.getChild(i).uri;
	    var dataCollected = {}
	    // LIST OF COLLECTED INFORMATIONS
	    // Domain: the domain of the OIDC request (e.g. facebook.com, google.com)
	    // Scope: the scope of authorization (e.g. openid profile email)
	    // Cliend ID: the identifier of the service requesting authorization
	    // Redirect URI: the URL for redirect with response to the service (e.g. airbnb.com/oauth/callback)
	    // Response type: the response type of the request (implicit or code flow)
	    // Acr values: the level of assurance requested for the user authentication

	    // Identity provider domain
	    dataCollected.domain = url.substring(0,url.indexOf('?'))
	    // URL parameters
	    var param = decodeURIComponent(url.substring(url.indexOf('?')))
	    // Split on '&'
	    var elt = param.split(/%3F|%26|\?|&/)
	    for(var j = 0; j< elt.length; j++){
	    	// Collect OAuth/OIDC scope present after 'scope='
	    	if(elt[j].startsWith('scope='))
	    		dataCollected.scope = elt[j].split('scope=')[1]
	    	// Collect client_id number (does not give client URL)
			else if(elt[j].startsWith('claims='))
	    	    dataCollected.claims = elt[j].split('claims=')[1]
			else if(elt[j].startsWith('client_id='))
			    //Got instance of too big client_id, triming to 256
	    		dataCollected.client_id = elt[j].split('client_id=')[1].substring(0,256)
	        else if(elt[j].startsWith('redirect_uri='))
	    		dataCollected.redirect_uri = decodeURIComponent(elt[j].split('redirect_uri=')[1])
	        else if(elt[j].startsWith('response_type='))
	    		dataCollected.response_type = elt[j].split('response_type=')[1]
	        else if(elt[j].startsWith('acr_values='))
	    		dataCollected.acr_values = elt[j].split('acr_values=')[1]
	    }
		
		scope_history.push(dataCollected)
	}
	// Close container when done
	cont.containerOpen = false;
	var message = {
				   ID: addonData.ID,
				   data: scope_history}

	// IN success, save pushed data and lastPushAtTime
  var pr = postToServer(message)
  pr.then(response => {
    	addonData.pushedData.push(scope_history)
    	addonData.lastPushAtTime = Date.now()
    	console.log('Saving collected data in storage')
    	saveAddonData(addonData)
    	popup.port.emit('addonData', {addonData: addonData})
  })
  .catch(error => console.log(error))
}

// POST data to our server
function postToServer(message){
  	if(message.data.length > 0){
      // POST TO SERVER
      console.log('Sending collected data')
      if(fetch){
        var init = {
          headers: {
                'Content-Type': 'application/json'
            },
          method: 'POST',
          body: JSON.stringify(message)
        }
        //return fetch('http://192.168.99.100:8080/data', init)
        return fetch('https://connect-history.rethink2.orange-labs.fr/data', init)
      } else {
        var http = new XMLHttpRequest();
        var url = 'https://connect-history.rethink2.orange-labs.fr/data';
        http.open('POST', url, true);

        //Send the proper header information along with the request
        http.setRequestHeader('Content-type', 'application/json');

        http.onreadystatechange = function() {//Call a function when the state changes.
          if(http.readyState == 4 && http.status == 200) {
              console.log(http.responseText);
              return new Promise(function(resolve, reject){resolve()})
          }
        }
        http.send(message);
      }
    }
    return new Promise(function(resolve, reject){resolve()})
}