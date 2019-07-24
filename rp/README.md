# NDID Example client app (RP)

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
    * `API_SERVER_ADDRESS`: An address (`http://IP:PORT`) of NDID API server [Default: `http://localhost:8080`].
    * `NDID_API_CALLBACK_IP`: IP address for NDID server to send callback. [Default: `localhost`]
    * `NDID_API_CALLBACK_PORT`: Port for NDID server to send callback. [Default: `5001`]
    
    **Examples**
    * Run a client app server

        ```
        API_SERVER_ADDRESS=http://localhost:8080 \
        NDID_API_CALLBACK_IP=localhost \
        NDID_API_CALLBACK_PORT=5001 \
        npm start
        ```
## API

1. `POST /rp/requests/{namespace}/{identifier}`
    
    ```
    { 
      mode,
      reference_id,
      request_timeout,
      request_message,
      min_idp,
      min_ial,
      min_aal,
      idp_id_list,
      data_request_list,
      bypass_identity_check,
      auto_close = true,
      auto_remove_data = true,
      auto_remove_private_message = true 
    }
    ```

2. `POST /rp/request_close`

    ```
    {
      request_id,
    }
    ```
  
3. `POST /rp/request_data_removal/{request_id}`

    ```
    {
      request_id,
    }
    ```

4. `POST /utility/private_message_removal/{request_id}`

    ```
    {
      request_id,
    }
    ```

5. `GET /utility/private_messages/{request_id}`

6. `GET /rp/request_data/{request_id}`

