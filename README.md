# pockist
#personalproject

*pocket assistant*

https://pockist.com

---

Update: I am making this repository the self hosted version of this project. 

I may later create a public facing Pockist Cloud SAAS.

---

I am using golang with sqlite on the backend with html, css, and javascript on the frontend. 
Deployed with docker on a five dollar vps.

This is a "vanilla" project, with the least amount of dependencies as possible. 
I chose thie because I want to learn the fundamentals of every "tool" in the stack, 
to be as lightweight as possible and to avoid package driven development.

The idea is to have a self hosted private personal data app for my daily needs.

I know there are probably options for selfhosted apps for these things,
but I am using this as a learning experience and because its fun.


## Deploy notes
C
### Local: Build and package
docker build -t pockist:latest .
docker save pockist:latest | gzip > pockist.tar.gz
scp pockist.tar.gz user@server:/opt/pockist/

### Server: Deploy
ssh user@server "cd /opt/pockist && docker load < pockist.tar.gz && docker stop pockist && docker rm pockist && docker run -d --name pockist -p 8080:8080 pockist:latest"
Note: The scripts assume you have SSH access to your server and Docker is installed there. Update SERVER_HOST, SERVER_USER, and other variables as needed.

## Fully Manual Deploy

### Local: Build and package
docker build -t pockist:latest . && docker save pockist:latest | gzip > pockist.tar.gz && scp pockist.tar.gz user@server:/opt/pockist/

### Server: Deploy
cd /opt/pockist && docker stop pockist && docker rm pockist && docker load < pockist.tar.gz && docker run -d --name pockist -p 8081:8081 pockist:latest


---


## Dependencies not checked into git

[Observable Plot & D3](https://observablehq.com/plot/getting-started)

d3.min.js

plot.min.js

or

```javascript
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6"></script>
```

---

## Cache control

- everything 30 seconds on client
- weather api 20 min on server
- geolocation like 7 days?




