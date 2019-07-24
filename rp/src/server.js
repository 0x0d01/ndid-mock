import 'source-map-support/register';

import http from 'http';

import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';

import * as API from './api';
import * as config from './config';
import uuid from 'uuid/v4';

const cache = {};

process.on('unhandledRejection', function(reason, p) {
  console.error('Unhandled Rejection:', p, '\nreason:', reason.stack || reason);
});

const app = express();

app.use(bodyParser.json({ limit: '5mb' }));

app.use(morgan('combined'));

app.post('/rp/requests/:namespace/:identifier', async (req, res) => {
  const {
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
    auto_remove_private_message = true,
  } = req.body;

  const referenceId = reference_id || uuid();

  try {
    const request = await API.createRequest({
      mode: mode || 3,
      namespace: req.params.namespace,
      identifier: req.params.identifier,
      reference_id: referenceId,
      idp_id_list: idp_id_list || [],
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/rp/request/${referenceId}`,
      data_request_list: data_request_list
        ? data_request_list.map((item) => ({
            service_id: item.service_id,
            as_id_list: item.as_id_list,
            min_as: item.min_as,
            request_params: item.request_params,
          }))
        : undefined,
      request_message,
      min_ial,
      min_aal,
      min_idp,
      request_timeout,
      bypass_identity_check,
    });

    cache[request.request_id] = {
      auto_close,
      auto_remove_data,
      auto_remove_private_message,
    };

    res.status(202).json({ request_id: request.request_id, reference_id: referenceId }).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/rp/request_close', async (req, res) => {
  try {
    await closeRequest(req.body.request_id);
    res.status(202).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/rp/request_data_removal/:request_id', async (req, res) => {
  try {
    await API.removeDataFromAS(req.params.request_id);
    res.status(204).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/utility/private_message_removal/:request_id', async (req, res) => {
  try {
    await API.removePrivateMessage(req.params.request_id);
    res.status(204).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.get('/utility/private_messages/:request_id', async (req, res) => {
  try {
    const privateMessages = await API.getPrivateMessage(req.params.request_id);
    res.status(200).json(privateMessages).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.get('/rp/request_data/:request_id', async (req, res) => {
  try {
    const requestData = await API.getRequestData(req.params.request_id);
    res.status(200).json(requestData).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/rp/request/:referenceId', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('Received request callback from NDID API:', JSON.stringify(callbackData, null, 2));
    processCallback(callbackData);
    res.status(204).end();
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/rp/request/close', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('Received close request callback from NDID API:', JSON.stringify(callbackData, null, 2));
    processCallback(callbackData);
    res.status(204).end();
  } catch (error) {
    handleError(error, res);
  }
});

async function processCallback(data) {
  if (data.type === 'create_request_result') {
    console.log('Create request result', data);
  } else if (data.type === 'request_status') {
    if (
      data.mode === 1 
      || ((data.mode === 2 || data.mode === 3) 
      && null === data.response_valid_list.find(
          (responseValid) => !responseValid.valid_signature || !responseValid.valid_ial
        ))
    ) {
      if (data.status === 'completed') {
        // do nothing
      } else if (
        (data.status === 'rejected' || data.status === 'complicated') 
        && data.answered_idp_count === data.min_idp
      ) {
        if (cache[data.request_id].auto_close) {
          closeRequest(data.request_id);
        }
      }
    }

    if (data.closed || data.timed_out) {
      if (cache[data.request_id].auto_remove_data) {
        API.removeDataFromAS(data.request_id);
      }

      if (cache[data.request_id].auto_remove_private_message) {
        API.removePrivateMessage(data.request_id);
      }
    }
  } else if (data.type === 'close_request_result') {
    if (data.success) {
      console.log('Successfully close request ID:', data.request_id);
    } else {
      console.error('Error closeing request ID:', data.request_id);
    }
  } else if (data.type === 'error') {
    // TODO: callback when using async createRequest and got error
  } else {
    console.error('Unknown callback type', data);
    return;
  }
}

function closeRequest(requestId) {
  const reference_id = uuid();

  return API.closeRequest({
    reference_id,
    callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/rp/request/close`,
    request_id: requestId,
  });
}

function handleError(error, res) {
  console.error(error);
  switch (error.constructor.name) {
    case 'Response':
      res.status(error.status).end();
      break;

    case 'Object':
      res.status(error.status).json(error.body).end();
      break;

    case 'Error':
    default:
      res.status(500).json({ error: error.message }).end();
      break;
  }
}

const server = http.createServer(app);
server.listen(config.ndidApiCallbackPort);

console.log(`RP Web Server is running. Listening to port ${config.ndidApiCallbackPort}`);
