/******************************************************************************
									UI
******************************************************************************/
var manifest,
    addonData;

self.port.on("show", function onShow(msg) {
  manifest = msg.manifest

  // Init about
  document.getElementById("title").textContent=manifest.name
  document.getElementById("aboutTitle").textContent=manifest.aboutTitle
  document.getElementById("aboutMain").textContent=manifest.aboutMain
  document.getElementById("aboutSource").textContent=manifest.aboutSource
  document.getElementById("version").textContent="Version "+manifest.version+" for Firefox"
  about() //dislay
});

self.port.on("addonData", function(msg){
    addonData = msg.addonData
    data()
})

function about(){
  document.getElementById("aboutDiv").style.display = 'block'
  document.getElementById('submitDiv').style.display = 'none'
  document.getElementById("dataDiv").style.display = 'none'
  document.getElementById("tab").textContent='About'
}

function data(){
  document.getElementById("tab").textContent='Data'
  document.getElementById("aboutDiv").style.display = 'none'
  document.getElementById('submitDiv').style.display = 'none'
  document.getElementById("dataDiv").style.display = 'block'
  document.getElementById("userid").textContent = "UserID: "+addonData.ID
  var date = new Date(addonData.lastPushAtTime)
  document.getElementById("lastTime").textContent = "Last submit : "+date.getDate()+"/"+(date.getMonth()+1)+"/"+date.getFullYear()+" "+date.getHours()+":"+date.getMinutes()
  document.getElementById("pushedData").textContent = JSON.stringify(addonData.pushedData)
}

function collect(){
  document.getElementById('tab').textContent='Collect'
  document.getElementById('aboutDiv').style.display = 'none'
  document.getElementById('submitDiv').style.display = 'block'
  document.getElementById('dataDiv').style.display = 'none'


  document.getElementById('TC_1').textContent=manifest.TC_1
  document.getElementById('TC_2').textContent=manifest.TC_2
  document.getElementById('acceptTC').textContent=manifest.acceptTC
}

document.getElementById('buttonCollect').addEventListener("click", collect)
document.getElementById('buttonSubmit').addEventListener("click", function(){self.port.emit('doCommit')})
document.getElementById('buttonInfo').addEventListener("click", about)
document.getElementById('buttonData').addEventListener("click", function(){self.port.emit('getData')})
document.getElementById('buttonReset').addEventListener("click", function(){self.port.emit('doReset')})

//Intercept link
document.documentElement.addEventListener("click", event => {
  let a = event.target.closest("a");

  if (a && a.href) {
    event.preventDefault()
    self.port.emit("openTab", {url: a.href});
  }
});