# Unleash Feature Flag Tutorial

How can we protect our applications from unexpected errors and load spikes by using feature flags to offload traffic to CDNs during errors.

Application is running in production and suddenly an error occurs. The app should include a circuit breaker to instead serve page from the CDN.

----

# Prerequisites

- A full Keptn installation
- [Dynatrace monitoring and the Dynatrace SLI Provider](https://keptn.sh/docs/0.6.0/reference/monitoring/dynatrace/) installed and configured on the Keptn machine.
- An Ubuntu VM used to host your website and the Unleash Feature Flag service.

## Networking Prerequisites
For this demo:
- The `keptn` VM will need to allow inbound HTTPS traffic from Dynatrace SaaS.
- The `application` VM (running `proxy`, `app`, `unleash` and `postgres`) will need to allow inbound HTTP & HTTPS traffic from the `keptn` machine.

# Tutorial Overview
This tutorial will run 4x containers on your application VM. You'll need the OneAgent deployed on this VM first.

1. An nginx reverse proxy to access app on port `80` (`http://127.0.0.1`)
1. An unleash feature flag container (`http://127.0.0.1/unleash`)
1. The app container (Accessed via reverse proxy on port `80`)
1. A PostGRES Database container

If the feature flag is `disabled` the app will serve `index.html` from within the container.
If the feature flag is `enabled` the app will serve a page hosted on GitHub (`https://raw.githubusercontent.com/agardnerIT/OddFiles/master/index2.html`)

----

> Run the following on the application VM.

# Deploy the OneAgent
Deploy the OneAgent on the application VM.

# Install & Configure: Git and Docker

```
sudo apt update && sudo apt install git docker.io -y
sudo usermod -aG docker $USER
```

Launch a new terminal window to pick up your new permissions. Validate it works with `docker ps`

You should see:

```
CONTAINER ID    IMAGE    COMMAND    CREATED    STATUS    PORTS    NAMES

```

# Clone This Repo
```
git clone https://github.com/agardnerit/unleashtutorial
cd unleashtutorial && chmod +x loadGenErrors.sh
```

# Create New Docker Network
This allows containers to talk to each other via their container name.

```
docker network create agardner-net
```

# Run a PostGresDB for Unleash
```
docker run -d --name postgres --network agardner-net -e POSTGRES_PASSWORD=mysecretpassword -e POSTGRES_DB=unleash postgres
```
Database = `unleash`
Username = `postgres`
Password = `mysecretpassword`

# Build & Run the Unleash Container
```
docker build -t unleash ./unleash && docker run -d --name unleash --network agardner-net -e DATABASE_URL=postgres://postgres:mysecretpassword@postgres:5432/unleash unleash
```

# Build and Run the App
This app has a feature flag coded into it called `EnableStaticContent`.

```
docker build -t app . && docker run -d --name app --network agardner-net app
```

# Build and Run the NGINX Reverse Proxy
```
docker build -t proxy ./proxy && docker run -d -p 80:80 --name proxy --network agardner-net -e DT_CUSTOM_PROP="keptn_project=website keptn_service=front-end keptn_stage=production" proxy
```

# Validate Containers

Running `docker ps` should show 4x containers: `proxy`, `app`, `unleash` and `postgres`.

# Validate UI

- The Unleash UI should now be available on `http://<VM-IP>/unleash`
- The app should now be available on `http://<VM-IP>`

Validate that both of these are available by visiting them in a browser.

# Validate Dynatrace Tags

In your Dynatrace tenant, open the `Transactions and Services` page, select the `Keptn website production` management zone to filter your services and navigate to the `unleash-demo` service.

Ensure that your service is tagged with the following:

`keptn_project:website`, `keptn_service:front-end` and `keptn_stage:production`

These tags are created when you [installed the Dynatrace service on Keptn](https://keptn.sh/docs/0.6.0/reference/monitoring/dynatrace) . If you do not see these tags, please **STOP** and ensure you follow this instructions linked above.

This tutorial **WILL NOT WORK** without those tags.

# Validate Problem Notification Integration

Keptn automatically configures the problem notification integration when you onboard the Dynatrace Service.

Validate that it's available now. In Dynatrace, go to `Settings > Integration > Problem Notifications` and you should see an entry for Keptn. If you do not see this problem notification, **STOP** and ensure you've installed Dynatrace on the keptn box.

This tutorial **WILL NOT WORK** without this integration.

# Configure Problem Sensitivity
For demo purposes, we will set Dynatrace to be extremely sensitive to failures.
Find the `unleash-demo:80` nginx service, edit the anomaly detection settings and set the failure rate detection to manual, the sensitivity to high and the requests per minute level to be `1 request per minute`.

# Create Feature Flag
- Go to `http://<VM-IP>/unleash` and login (use any fake values you like to login)
- Create a feature flag called `EnableStaticContent` (case sensitive and must be called this).
- Set the flag to `disabled`

# Manually Test Flag
Prove that the feature flag works:

- Go to the app (`http://<VM-IP>`) and refresh the page. You should still see the blue banner. This page is served from the `app` container.
- Enable the feature flag and refresh the app. Notice the green banner, this page is served from GitHub.

Once done, set the flag to `disabled` so that traffic is being served by the app (blue banner).

----

> The following instructions should be executed on the Keptn machine.

# Clone Repo to Keptn Machine, Create Keptn Project & Service
```
cd ~
git clone http://github.com/agardnerit/unleashtutorial
cd unleashtutorial
keptn create project website --shipyard=shipyard.yaml
keptn create service front-end --project=website
keptn add-resource --project=website --service=front-end --stage=production --resource=remediations.yaml --resourceUri=remediation.yaml
```

The values in the `remediations.yaml` file tell Keptn how to response when it sees a failure rate increase problem for this project (`website`), service (`front-end`) and stage (`production`)

# Create Secret & Bounce Remediation Service
Note that the `username` and `token` can be set to anything.

The `remediation-service` pod must be recreated so that it picks up this new secret.

```
kubectl create secret -n keptn generic unleash --from-literal="UNLEASH_SERVER_URL=http://<YOUR-APP-VM-IP>/unleash/api" --from-literal="UNLEASH_USER=me" --from-literal="UNLEASH_TOKEN=whatever"
kubectl delete pod -n keptn -l "run=remediation-service"
```

# Load Generator

> Run this on the VM hosting the website.

Run the load generator which will create errors. In another tab, keep refreshing the page and in a few minutes (when DT raises a problem) you'll see the website failover to the green static hosted content.

```
cd ~/unleashtutorial
./loadGenErrors.sh
```

- You will see `HTTP 500` errors being shown. The failure rate registered by Dynatrace on the `unleash-demo:80` service will also increase.
- Dynatrace will register a problem and push a notification to Keptn.
- The Keptn `remediation-service` will activate and toggle the feature based on the `remediations.yaml` file.
- The feature flag will be `enabled` and the CDN page will be served (from GitHub) ([this is the actual page](https://github.com/agardnerIT/OddFiles/blob/master/index2.html))

----

# Debugging / Troubleshooting

Here are some useful commands to assist troubleshooting.

Check the `remediation-service` logs:
```
kubectl logs -n keptn -l 'run=remediation-service'
```

Verify manually that Keptn successfully toggles the feature flag. If successful, the flag should be enabled.
```
cd ~/unleashtutorial
keptn send event -f debug/problemopen.json
```
----

# Cleanup
To remove everything installed / configured for this demo:
```
docker stop proxy app unleash postgres
docker rm proxy app unleash postgres
docker rmi proxy app unleash postgres
docker network rm agardner-net
# On the Keptn Machine
keptn delete project website
kubectl delete secret -n keptn unleash && kubectl delete pod -n keptn -l 'run=remediation-service'
```
