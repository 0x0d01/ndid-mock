import 'source-map-support/register';

import bodyParser from 'body-parser';

import http from 'http';
import express from 'express';
import morgan from 'morgan';

import * as API from './api';

import * as db from './db';
import fs from 'fs';
import * as zkProof from './zkProof';
import { spawnSync } from 'child_process';

import * as config from './config';

import uuid from 'uuid/v4';

//===== INIT ========
spawnSync('mkdir', ['-p', config.keyPath]);
//===================

process.on('unhandledRejection', function(reason, p) {
  console.error('Unhandled Rejection:', p, '\nreason:', reason.stack || reason);
});

const app = express();

app.use(bodyParser.urlencoded({ extended: false, limit: '2mb' }));
app.use(bodyParser.json({ limit: '2mb' }));

app.use(morgan('combined'));

// FOR DEBUG
if (
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === undefined
) {
  app.use((req, res, next) => {
    if (req.method === 'POST') {
      console.log(req.method, req.originalUrl, req.params, req.body);
    }
    if (req.method === 'GET') {
      console.log(req.method, req.originalUrl, req.params, req.query);
    }
    next();
  });
}

(async () => {
  for (;;) {
    try {
      await API.setCallbackUrls({
        incoming_request_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/request`,
        accessor_sign_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/accessor`,
        error_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/error`,
      });
      console.log('=== callback set OK ===');
      break;
    } catch (error) {
      console.error('Error setting callback URL at NDID API, retrying...', error);
    }
    // simple wait
    await new Promise((resolve, reject) => setTimeout(resolve, 5000)); // wait for 5 seconds
  }
})();

//////

app.post('/callback/idp/error', async (req, res) => {
  try {
    const callbackData = req.body;
    console.error(
      'Received error callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/request', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received incoming request callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );
    
    // handle request here !!!
    createResponse(callbackData);

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/identity', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received create identity callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'create_identity_request_result') {
      if (callbackData.success) {
        db.addOrUpdateReference(callbackData.reference_id, {
          exist: callbackData.exist,
        });
      } else {
        db.removeReference(callbackData.reference_id);
      }
    } else if (callbackData.type === 'create_identity_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          accessor_id,
          accessor_private_key,
          accessor_public_key,
          ial,
          aal,
          response,
          delay
        } = db.getReference(callbackData.reference_id);
        db.addUser(namespace, identifier, {
          accessors: [
            {
              accessor_id,
              accessor_private_key,
              accessor_public_key,
              secret: callbackData.secret,
            },
          ],
          ial,
          aal,
          response,
          delay
        });
      }
      db.removeReference(callbackData.reference_id);
    } else {
      throw new Error('Unkonwn callback type: ' + callbackData.type)
    }

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/accessor', async (req, res) => {
  try {
    let { sid, accessor_id, reference_id } = req.body;
    const { accessor_private_key } = db.getReference(reference_id);
    res.status(200).send({
      signature: zkProof.signMessage(sid, accessor_private_key),
    });
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/response', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received response result callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

//////

app.post('/updateIdentity', async (req, res) => {
  const { namespace, identifier, ial, aal, response, delay = 0 } = req.body;
  try {
    db.updateUser(namespace, identifier, {
      ial,
      aal,
      response,
      delay
    });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.status(500).json(error.error ? error.error.message : error);
  }
});

// delay is in ms
app.post('/identity', async (req, res) => {
  const { namespace, identifier, ial, aal, response, delay = 0 } = req.body;
  try {
    const sid = namespace + ':' + identifier;
    //gen new key pair
    zkProof.genNewKeyPair(sid);

    const accessor_public_key = fs.readFileSync(
      config.keyPath + sid + '.pub',
      'utf8'
    );
    const accessor_private_key = fs.readFileSync(config.keyPath + sid, 'utf8');

    const reference_id = uuid();

    db.addOrUpdateReference(reference_id, {
      namespace,
      identifier,
      accessor_private_key,
      accessor_public_key,
      ial,
      aal,
      response,
      delay
    });

    const { request_id, accessor_id } = await API.createNewIdentity({
      reference_id,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/identity`,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key,
      //accessor_id,
      ial,
    });

    db.addOrUpdateReference(reference_id, {
      request_id,
      accessor_id,
    });

    res.status(200).send({
      request_id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json(error.error ? error.error.message : error);
  }
});

async function createResponse({request_id, namespace, identifier, mode, request_message_hash, min_ial, min_aal}) {
  const user = db.getUserByIdentifier(namespace, identifier);
  if (mode === 3) {
    if (!user) {
      throw new Error('User is not found: ' + namespace + '/' + identifier);
    }

    const reference_id = uuid();
    try {
      await new Promise((resolve) => setTimeout(resolve, user.delay * 1000 || 0));
      await API.createIdpResponse({
        reference_id,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/response`,
        request_id: request_id,
        namespace: user.namespace,
        identifier: user.identifier,
        ial: user.ial,
        aal: user.aal,
        secret: user.accessors[0].secret,
        status: user.response, // 'accept' or 'reject'
        signature: zkProof.privateEncrypt(
          request_message_hash,
          user.accessors[0].accessor_private_key
        ),
        accessor_id: user.accessors[0].accessor_id,
      });
      return reference_id;
    } catch (error) {
      throw error;
    }
  } else {
    const reference_id = uuid();
    
    try {
      if (user) {
        await new Promise((resolve) => setTimeout(resolve, user.delay * 1000 || 0));
      }
      await API.createIdpResponse({
        reference_id,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/response`,
        request_id: request_id,
        namespace: namespace,
        identifier: identifier,
        ial: user ? user.ial : min_ial,
        aal: user ? user.aal : min_aal,
        status: user ? user.response : 'accept',
        signature: 'this is signature',
      });
      return reference_id;
    } catch (error) {
      throw error;
    }
  }
}

const server = http.createServer(app);
server.listen(config.ndidApiCallbackPort);

console.log(`IDP Server is running. Listening to port ${config.ndidApiCallbackPort}`);
