# NDID Example client app (IDP)

## Prerequisites

* Node.js 8.9 or later
* npm 5.6.0 or later

## Getting started

1.  Install dependencies

    ```
    npm install
    ```
2.  Run a server

    ```
    npm start
    ```

    **Environment variable options**
    * `API_SERVER_ADDRESS`: An address (`http://IP:PORT`) of NDID API server [Default: `http://localhost:8081`].
    * `NDID_API_CALLBACK_IP`: IP address for NDID server to send callback. [Default: `localhost`]
    * `NDID_API_CALLBACK_PORT`: Port for NDID server to send callback. [Default: `5002`]
    * `PERSISTENT_PATH`: Path to store persistent data. [Default: `./persistent_db/`]
    * `KEY_PATH`: Path to store accessor keys. [Default: `./persistent_db/user_key/`]
    * `DB_NAME`: Database filename. [Default: `db.json`]

    **Examples**
    * Run a client app server

        ```
        API_SERVER_ADDRESS=http://localhost:8081 \
        NDID_API_CALLBACK_IP=localhost \
        NDID_API_CALLBACK_PORT=5002 \
        npm start
        ```
## API

1. `POST /identity`
  * `{ namespace, identifier, ial, aal, response, mode, delay = 0 } = req.body` (delay in second)

2. `POST /updateIdentity`
  * `{ namespace, identifier, aal, response, delay = 0 } = req.body` (delay in second)

3. `POST /updateMode`
  * `{ namespace, identifier, mode } = req.body`

4. `POST /updateIAL`
  * `{ namespace, identifier, ial } = req.body`
