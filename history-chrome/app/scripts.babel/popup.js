/******************************************************************************
								LOCAL STORAGE
******************************************************************************/
var manifest = chrome.runtime.getManifest();

function loadAddonData(){
	return new Promise((resolve, reject) => {
	  chrome.storage.local.get('connect_history', function(result){
      if(result.connect_history){
      	resolve(JSON.parse(result['connect_history']))
      } else { // Else only init ID
      	var addonData = {
      		ID: Math.random().toString(36).substr(2, 9),
      		lastPushAtTime: 0,
      		pushedData: []
      	}
      	resolve(addonData)
      }
	  })
  })
}

function saveAddonData(addonData){
  // Save it using the Chrome extension storage API.
  chrome.storage.local.set({'connect_history': JSON.stringify(addonData)}, function() {
    // Notify that we saved.
    console.log('Addon data saved')
  });
}


/******************************************************************************
									UI
******************************************************************************/
// Handle click on extension's button
// 1- Open collected history
// 2- Collect history


function about(){
  document.getElementById('aboutDiv').style.display = 'block'
  document.getElementById('submitDiv').style.display = 'none'
  document.getElementById('dataDiv').style.display = 'none'
  document.getElementById('tab').textContent='About'
}
// Init about
document.getElementById('title').textContent=manifest.name
document.getElementById('description').innerHTML=chrome.i18n.getMessage('aboutConnect')
document.getElementById('version').textContent='Version '+manifest.version+' for Google Chrome'
about() //dislay

function data(){
  document.getElementById('tab').textContent='Data'
  loadAddonData()
  .then(addonData => {
    document.getElementById('aboutDiv').style.display = 'none'
    document.getElementById('submitDiv').style.display = 'none'
    document.getElementById('dataDiv').style.display = 'block'
    document.getElementById('userid').textContent = 'UserID: '+addonData.ID
    var date = new Date(addonData.lastPushAtTime)
    document.getElementById('lastTime').textContent = 'Last submit : '+date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear()+' '+date.getHours()+':'+date.getMinutes()
    document.getElementById('pushedData').textContent = JSON.stringify(addonData.pushedData)
  })
}

function collect(){
  document.getElementById('tab').textContent='Collect'
  document.getElementById('aboutDiv').style.display = 'none'
  document.getElementById('submitDiv').style.display = 'block'
  document.getElementById('dataDiv').style.display = 'none'


  document.getElementById('TC_1').innerHTML=chrome.i18n.getMessage('TC_1')
  document.getElementById('TC_2').innerHTML=chrome.i18n.getMessage('TC_2')
  document.getElementById('acceptTC').innerHTML=chrome.i18n.getMessage('acceptTC')
}
//document.addEventListener('DOMContentLoaded', startCollection)

function startCollection(){
  loadAddonData()
  .then(addonData => collectHistory(addonData))
}

function reset(){
  loadAddonData()
    .then(addonData => {
      addonData.pushedData = []
      addonData.lastPushAtTime = 0

      saveAddonData(addonData)
    })
}

document.getElementById('buttonCollect').addEventListener('click', collect)
document.getElementById('buttonSubmit').addEventListener('click', startCollection)
document.getElementById('buttonInfo').addEventListener('click', about)
document.getElementById('buttonData').addEventListener('click', data)
document.getElementById('buttonReset').addEventListener('click', reset)

/******************************************************************************
								QUERY HISTORY
******************************************************************************/
// Collect history and send to server
function collectHistory(addonData) {
  console.log(addonData)
	var searchTerms='', //will have some false positive
	// Bug in chrome can't let search after % so unable to find scope=
	// after a %. So we search by ourself
	    beginTime =  parseFloat(addonData.lastPushAtTime)

	// execute the query and callback
	chrome.history.search({text: searchTerms,
	                       startTime: beginTime,
	                       maxResults: 1000 // Probably more than enough
	                       },
	function(history){compileAndSendData(history, addonData)})
}

function compileAndSendData(history, addonData){
  var scope_history = []
  //for each page.url in history
	for (var i = 0; i < history.length; i ++) {
	  var url = history[i].url
	  if(url.indexOf('scope') != -1 && url.indexOf('client_id') != -1){
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
	    //Only push if client_id found
		  if(dataCollected.client_id)
		    scope_history.push(dataCollected)
		}
	}
	var message = {
				   ID: addonData.ID,
				   data: scope_history
	}

	// IN success, save pushed data and lastPushAtTime
  var pr = postToServer(message)
  console.log(pr)
  pr.then(response => {
      console.log(response)
    	addonData.pushedData.push(scope_history)
    	addonData.lastPushAtTime = Date.now()
    	console.log('Saving collected data in storage')
    	saveAddonData(addonData)
    	data()
  })
  .catch(error => console.log(error))
}

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