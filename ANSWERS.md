# Answers

1. The app connects to Redis using the name `redis`. Docker Compose creates a shared network and uses DNS to let containers find each other by service name. The default `docker run` bridge network does not provide automatic name resolution, so the name `redis` will not work there. To use container names with `docker run`, both containers must be connected to the same user-defined bridge network.

2. The app is stateless, while Redis is stateful and stores data in the `redis_data` volume. I tested data persistence by removing and restarting the containers. The saved plan remained after removing the app container and running `docker compose down`, followed by restarting the services. After running `docker compose down -v` and restarting, the saved-plans endpoint returned an empty list because the volume was deleted.

3. A database password should come from a secure secret store or environment variable, not from source code. Committing it to Git leaves a copy in the repository history, even if you later delete it. A private repository can still be accessed by more people or accidentally exposed, so the password could be stolen. This project uses Redis and currently has no database password configured, so there is no password to protect in this setup.

## AI Assistant Usage
I used an AI assistant to clarify how Docker Compose connects the app and Redis and how Redis data persists. I reviewed and adapted the explanations to make sure I understand the setup and can explain the `compose.yaml` configuration.
