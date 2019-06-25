# NDID Example client app (AS)

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
    * `NDID_API_CALLBACK_IP`: IP address for NDID server to send callback. [Default: `localhost`]
    * `NDID_API_CALLBACK_PORT`: Port for NDID server to send callback. [Default: `5003`]
    * `DATA_DIR`: Path to directory for storing mock as data and configurations. [Default: `./data`]
    * `MIN_AAL`: Min AAL. [Default: `2.2`]
    * `MIN_IAL`: Min IAL. [Default: `2.3`]
    * `DEFAULT_DELAY`: Default delay in second before responding. [Default: `0`]

    **Examples**
    * Run a client app server

        ```
        API_SERVER_ADDRESS=http://localhost:8082 \
        NDID_API_CALLBACK_IP=localhost \
        NDID_API_CALLBACK_PORT=5003 \
        npm start
        ```

## Required Configuration Files

1. `services.json`: list of service_id to register

    ```
    {
      "services": [
        "001.cust_info_001",
        "001.basic_cust_info_001",
        "001.contact_cust_info_001"
      ]
    }
    ```
2. `delay.json`: list of delay in second before responding

    ```
    {
      "citizen_id": {
        "1234567890123": 0,
        "1234567890124": 10
      }
    }
    ```

3. `namespaces.json`: list of suported namespaces

    ```
    {
      "namespaces": [
        "citizen_id"
      ]
    }
    ```