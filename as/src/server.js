import 'source-map-support/register';

import * as API from './api';

import * as config from './config';

import uuid from 'uuid/v4';

import bodyParser from 'body-parser';
import http from 'http';
import express from 'express';
import morgan from 'morgan';

const fs = require('fs');
const path = require('path');

const SERVICES_JSON_PATH = path.join(config.DATA_BASE_PATH, 'services.json');
const DELAY_JSON_PATH = path.join(config.DATA_BASE_PATH, 'delay.json');
const serviceIDs = JSON.parse(fs.readFileSync(SERVICES_JSON_PATH, 'utf8')).services.reduce((pv, v) => {
  pv[v] = false; 
  return pv; 
}, {});

const app = express();
app.use(bodyParser.urlencoded({ extended: false, limit: '2mb' }));
app.use(bodyParser.json({ limit: '2mb' }));

app.use(morgan('combined'));

(async () => {
  for (;;) {
    let didFail = false;
    for (var serviceID in serviceIDs) {
      if (serviceIDs[serviceID]) continue;
      try {
        const reference_id = uuid();
        await API.registerAsService({
          service_id: serviceID,
          reference_id,
          callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/as/service`,
          min_ial: config.minIAL,
          min_aal: config.minAAL,
          url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/as/service/${serviceID}`,
        });
        serviceIDs[serviceID] = true;
      } catch (error) {
        if (error.error && error.error.code === 25005) continue;
        didFail = true;
        console.error('Error registering service', error);
      }
    }

    if (!didFail) {
      break;
    }

    // simple wait
    await new Promise((resolve, reject) => setTimeout(resolve, 5000)); // wait for 5 seconds
  }
})();

process.on('unhandledRejection', function(reason, p) {
  console.error('Unhandled Rejection:', p, '\nreason:', reason.stack || reason);
});

///////

app.post('/callback/as/error', async (req, res) => {
  const callbackData = req.body;
  const { serviceId } = req.params;
  console.error(
    `Received error callback for service: ${serviceId} from NDID API:`,
    JSON.stringify(callbackData, null, 2)
  );

  res.status(204).end();
});

app.post('/callback/as/service/:serviceId', async (req, res) => {
  const callbackData = req.body;
  const { serviceId } = req.params;
  console.log(
    `Received data request callback for service: ${serviceId} from NDID API:`,
    JSON.stringify(callbackData, null, 2)
  );
  
  sendData(callbackData);

  res.status(204).end();
});

app.post('/callback/as/service', async (req, res) => {
  const callbackData = req.body;
  console.log(
    'Received register service callback from NDID API:',
    JSON.stringify(callbackData, null, 2)
  );
  
  if (callbackData.success) {
    console.log('Successfully add or update service');
  } else {
    console.error('Add or update service ERROR', callbackData.error);
  }
  
  res.status(204).end();
});

app.post('/callback/as/data', async (req, res) => {
  const callbackData = req.body;
  console.log('Received send data callback from NDID API:', JSON.stringify(callbackData, null, 2));
  
  if (callbackData.success) {
    console.log('Successfully send data');
  } else {
    console.error('Send data ERROR', callbackData.error);
  }
  
  res.status(204).end();
});

///////

async function sendData({ service_id, request_id, namespace, identifier }) {
  const reference_id = uuid();
  let responseData;
  let delay;
  
  try {
    responseData = JSON.stringify(JSON.parse(fs.readFileSync(path.join(config.DATA_BASE_PATH, service_id + '_' + namespace + '_' + identifier + '.json'), 'utf8')));
  } catch (error) {
    responseData = 'mock data';
  }

  try {
    delay = JSON.parse(fs.readFileSync(DELAY_JSON_PATH, 'utf8'))[namespace][identifier];
  } catch (error) {
    delay = config.defaultDelay;
  }

  try {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    }
    await API.sendData({
      reference_id,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/as/data`,
      service_id,
      request_id,
      data: responseData,
    });
  } catch (error) {
    console.error('Error sending data', error);
  }
}

const server = http.createServer(app);
server.listen(config.ndidApiCallbackPort);

console.log('AS Server is running.  Listening to port ${config.ndidApiCallbackPort}`');
