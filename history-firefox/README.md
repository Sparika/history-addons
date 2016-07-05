# connect-history

Extension to gather OpenID Connect/OAuth history and retrieves scope usage.

The objective of this extension is to gather information related to OIDC/OAuth usage
by clients (service providers). To do so, the extension browses the navigation history
and retrieves parameters of OIDC/Oauth URL. 

Installing this extension allows us to gather these informations and discover various 
usage scenarios, OIDC/OAuth providers and clients.

LIST OF COLLECTED INFORMATIONS
* Domain: the domain of the OIDC request (e.g. facebook.com, google.com)
* Scope: the scope of authorization (e.g. openid profile email)
* Cliend ID: the identifier of the service requesting authorization
* Redirect URI: the URL for redirect with response to the service (e.g. airbnb.com/oauth/callback)
* Response type: the response type of the request (implicit or code flow)
* Acr values: the level of assurance requested for the user authentication