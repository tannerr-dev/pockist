# pockist
#personalproject

*pocket assistant*

https://pockist.com

---

I am using golang with sqlite on the backend with html, css, and javascript on the frontend. 
Deployed with docker on a five dollar vps.

This is a "vanilla" project, with the least amount of dependencies as possible. 
I chose thie because I want to learn the fundamentals of every "tool" in the stack, 
to be as lightweight as possible and to avoid package driven development.

The idea is to have a self hosted private personal data app for my daily needs.

I know there are probably options for selfhosted apps for these things,
but I am using this as a learning experience and because its fun.

---
Dependencies not checked into git:

[Observable Plot & D3](https://observablehq.com/plot/getting-started)

d3.min.js

plot.min.js

or

```javascript
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6"></script>
```

---

in progress:
- notes

next up:
- local first notes


todo:
- monies, make my finance spreadsheet into an app
- fridge & pantry
- workout tracker
- habit tracker
- tasks
- events


## Deploy notes

Created two scripts:
deploy.sh - One-command deployment from local:
### Set your server details
export SERVER_HOST="your-server.com"
export SERVER_USER="root"
./deploy.sh
deploy-server.sh - Server-side script (if you prefer manual steps):
### On server
./deploy-server.sh pockist_latest.tar.gz pockist pockist 8080
Manual approach (if you want full control):
### Local: Build and package
docker build -t pockist:latest .
docker save pockist:latest | gzip > pockist.tar.gz
scp pockist.tar.gz user@server:/opt/pockist/
### Server: Deploy
ssh user@server "cd /opt/pockist && docker load < pockist.tar.gz && docker stop pockist && docker rm pockist && docker run -d --name pockist -p 8080:8080 pockist:latest"
Note: The scripts assume you have SSH access to your server and Docker is installed there. Update SERVER_HOST, SERVER_USER, and other variables as needed.
