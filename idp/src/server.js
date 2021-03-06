import 'source-map-support/register';

import bodyParser from 'body-parser';

import http from 'http';
import express from 'express';
import morgan from 'morgan';

import * as API from './api';

import * as db from './db';
import fs from 'fs';
import * as utils from './utils';
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
        accessor_encrypt_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/accessor/encrypt`,
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
          mode,
          delay
        } = db.getReference(callbackData.reference_id);
        const user = db.getUserByIdentifier(namespace, identifier);
        if (user) {
          db.updateUser(namespace, identifier, {
            reference_group_code: callbackData.reference_group_code,
            accessorIds: [accessor_id],
            ial,
            aal,
            response,
            mode,
            delay
          });
        } else {
          db.addUser(namespace, identifier, {
            reference_group_code: callbackData.reference_group_code,
            accessorIds: [accessor_id],
            ial,
            aal,
            response,
            mode,
            delay
          });
        }
        db.addAccessor(accessor_id, {
          reference_group_code: callbackData.reference_group_code,
          accessor_private_key,
          accessor_public_key,
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

app.post('/callback/idp/mode', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received create identity callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'upgrade_identity_mode_result') {
      if (!callbackData.success) {
        db.removeReference(callbackData.reference_id);
      }
    } else if (callbackData.type === 'upgrade_identity_mode_request_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          mode
        } = db.getReference(callbackData.reference_id);
        db.updateUser(namespace, identifier, {
          mode
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

app.post('/callback/idp/ial', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received create identity callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'update_ial_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          ial
        } = db.getReference(callbackData.reference_id);
        db.updateUser(namespace, identifier, {
          ial
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
    const callbackData = req.body;
    console.log(
      'Received add accessor callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'add_accessor_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          accessor_id,
          accessor_public_key,
          accessor_private_key,
        } = db.getReference(callbackData.reference_id);

        const user = db.getUserByIdentifier(namespace, identifier);
        db.updateUser(namespace, identifier, {
          accessorIds: user.accessorIds.concat(accessor_id),
        });
        db.addAccessor(accessor_id, {
          reference_group_code: user.reference_group_code,
          accessor_private_key,
          accessor_public_key,
        });
      }
      db.removeReference(callbackData.reference_id);
    } else {
      throw new Error('Unkonwn callback type: ' + callbackData.type);
    }

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/accessor_revoke', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received accessor revoke callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'revoke_accessor_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          accessor_id,
        } = db.getReference(callbackData.reference_id);

        const user = db.getUserByIdentifier(namespace, identifier);
        const ind = user.accessorIds.indexOf(accessor_id);
        db.updateUser(namespace, identifier, {
          accessorIds: user.accessorIds.slice(0, ind).concat(user.accessorIds.slice(ind + 1)),
        });
        db.removeAccessor(accessor_id);
      }
      db.removeReference(callbackData.reference_id);
    } else {
      throw new Error('Unkonwn callback type: ' + callbackData.type);
    }

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/callback/idp/accessor_revoke_and_add', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received accessor revoke and add callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'revoke_and_add_accessor_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
          revoking_accessor_id,
          accessor_id,
          accessor_public_key,
          accessor_private_key,
        } = db.getReference(callbackData.reference_id);

        const user = db.getUserByIdentifier(namespace, identifier);
        const ind = user.accessorIds.indexOf(revoking_accessor_id);
        db.updateUser(namespace, identifier, {
          accessorIds: user.accessorIds.slice(0, ind).concat(user.accessorIds.slice(ind + 1), accessor_id),
        });
        db.removeAccessor(revoking_accessor_id);
        db.addAccessor(accessor_id, {
          reference_group_code: user.reference_group_code,
          accessor_private_key,
          accessor_public_key,
        });
      }
      db.removeReference(callbackData.reference_id);
    } else {
      throw new Error('Unkonwn callback type: ' + callbackData.type);
    }

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});
  
app.post('/callback/idp/association_revoke', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log(
      'Received association revoke callback from NDID API:',
      JSON.stringify(callbackData, null, 2)
    );

    if (callbackData.type === 'revoke_identity_association_result') {
      if (callbackData.success) {
        const {
          namespace,
          identifier,
        } = db.getReference(callbackData.reference_id);

        const user = db.getUserByIdentifier(namespace, identifier);
        user.accessorIds.forEach((accessor_id) => db.removeAccessor(accessor_id));
        db.removeUser(namespace, identifier);
      }
      db.removeReference(callbackData.reference_id);
    } else {
      throw new Error('Unkonwn callback type: ' + callbackData.type);
    }

    res.status(204).end();
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

app.post('/updateMode', async (req, res) => {
  try {
    const { namespace, identifier, mode } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    if (user.mode === 1) {
      const request_id = await createIdentity(
        namespace, 
        identifier, 
        user.ial, 
        user.aal, 
        user.response, 
        mode, 
        user.delay
      );
      
      res.status(200).json({
        request_id,
      });
    } else {
      const reference_id = uuid();
      db.addOrUpdateReference(reference_id, {
        namespace,
        identifier,
        mode
      });

      try {
        const { request_id } = await API.updateMode({
          namespace, 
          identifier,
          reference_id,
          callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/mode`,
          mode,
          request_message: "Please give consent for onboarding with Mock IDP on mode 3.", 
        });

        db.addOrUpdateReference(reference_id, {
          request_id
        });

        res.status(200).json({
          request_id,
        });
      } catch (error) {
        db.removeReference(reference_id);
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json(error.error ? error.error.message : error);
  }
});

app.post('/updateIAL', async (req, res) => {
  try {
    const { namespace, identifier, ial } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    if (user.mode === 1) {
      db.updateUser(namespace, identifier, {
        ial
      });
      res.status(200).end();
    } else {
      const reference_id = uuid();
      db.addOrUpdateReference(reference_id, {
        namespace,
        identifier,
        ial
      });

      try {
        await API.updateIAL(namespace, identifier, {
          reference_id,
          callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/ial`,
          ial,
        });

        res.status(200).end();
      } catch (error) {
        db.removeReference(reference_id);
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json(error.error ? error.error.message : error);
  }
});

app.post('/updateIdentity', async (req, res) => {
  const { namespace, identifier, aal, response, delay = 0 } = req.body;
  
  try {
    const user = db.getUserByIdentifier(namespace, identifier);
    if (user) {
      db.updateUser(namespace, identifier, {
        aal,
        response,
        delay
      });
      res.status(200).end();
    } else {
      res.status(400).json({error: 'Unknown SID'});
    }
  } catch (error) {
    console.error(error);
    res.status(500).json(error.error ? error.error.message : error);
  }
});

app.post('/identity/:namespace/:identifier/association_revoke', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const { reference_id } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    const refId = reference_id || uuid();
    db.addOrUpdateReference(refId, {
      namespace,
      identifier,
    });

    try {
      const json = await API.revokeAssociation(namespace, identifier, {
        reference_id: refId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/association_revoke`,
      });

      res.status(202).json(json).end();
    } catch (error) {
      db.removeReference(reference_id);
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

app.post('/identity/:namespace/:identifier/accessor_revoke', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const { reference_id, accessor_id } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    const refId = reference_id || uuid();
    db.addOrUpdateReference(refId, {
      namespace,
      identifier,
      accessor_id
    });

    try {
      const json = await API.revokeAccessor(namespace, identifier, {
        reference_id: refId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/accessor_revoke`,
        accessor_id,
      });

      res.status(202).json(json).end();
    } catch (error) {
      db.removeReference(reference_id);
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

app.post('/identity/:namespace/:identifier/accessors', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const { accessor_id, accessor_type, reference_id } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    const sid = namespace + ':' + identifier;
    
    //gen new key pair
    utils.genNewKeyPair(sid);

    const accessor_public_key = fs.readFileSync(
      config.keyPath + sid + '.pub',
      'utf8'
    );
    const accessor_private_key = fs.readFileSync(config.keyPath + sid, 'utf8');

    const refId = reference_id || uuid();
    db.addOrUpdateReference(refId, {
      namespace,
      identifier,
      accessor_type,
      accessor_public_key,
      accessor_private_key,
    });

    try {
      const json = await API.addAccessor(namespace, identifier, {
        reference_id: refId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/accessor`,
        accessor_id,
        accessor_type,
        accessor_public_key,
      });

      db.addOrUpdateReference(refId, {
        accessor_id: json.accessor_id,
      });

      res.status(202).json(json).end();
    } catch (error) {
      db.removeReference(refId);
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

app.post('/identity/:namespace/:identifier/ial', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const { ial, reference_id } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    const refId = reference_id || uuid();
    db.addOrUpdateReference(refId, {
      namespace,
      identifier,
      ial
    });

    try {
      const json = await API.updateIAL(namespace, identifier, {
        reference_id: refId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/ial`,
        ial,
      });

      res.status(202).json(json).end();
    } catch (error) {
      db.removeReference(refId);
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

app.post('/identity/:namespace/:identifier/accessor_revoke_and_add', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const { reference_id, revoking_accessor_id, accessor_id, accessor_type } = req.body;
    const user = db.getUserByIdentifier(namespace, identifier);
    if (!user) {
      res.status(400).json({error: 'Unknown SID'});
      return;
    }

    const sid = namespace + ':' + identifier;
    
    //gen new key pair
    utils.genNewKeyPair(sid);

    const accessor_public_key = fs.readFileSync(
      config.keyPath + sid + '.pub',
      'utf8'
    );
    const accessor_private_key = fs.readFileSync(config.keyPath + sid, 'utf8');

    const refId = reference_id || uuid();
    db.addOrUpdateReference(refId, {
      namespace,
      identifier,
      revoking_accessor_id,
      accessor_private_key,
      accessor_public_key
    });

    try {
      const json = await API.revokeAndAddAccessor(namespace, identifier, {
        reference_id: refId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/accessor_revoke_and_add`,
        revoking_accessor_id,
        accessor_id,
        accessor_type,
        accessor_public_key,
      });

      db.addOrUpdateReference(refId, {
        accessor_id: json.accessor_id,
      });

      res.status(202).json(json).end();
    } catch (error) {
      db.removeReference(reference_id);
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

// delay is in ms
app.post('/identity', async (req, res) => {
  const { namespace, identifier, ial, aal, response, mode, delay = 0 } = req.body;
  try {
    const user = db.getUserByIdentifier(namespace, identifier);
    if (user) {
      res.status(400).json({error: "SID exists in mock db"});
      return;
    }

    switch (parseInt(mode, 10)) {
      case 2:
      case 3:
        const request_id = await createIdentity(namespace, identifier, ial, aal, response, mode, delay);

        res.status(200).json({
          request_id,
        });
        break;

      case 1:
      default: 
        db.addUser(namespace, identifier, {
          ial,
          aal,
          response,
          mode,
          delay
        });

        res.status(200).end();
    }

    
  } catch (error) {
    console.error(error);
    res.status(error.status).json(error.error ? error.error.message : error);
  }
});

async function createIdentity(namespace, identifier, ial, aal, response, mode, delay) {
  const sid = namespace + ':' + identifier;
  const reference_id = uuid();

  //gen new key pair
  utils.genNewKeyPair(sid);

  const accessor_public_key = fs.readFileSync(
    config.keyPath + sid + '.pub',
    'utf8'
  );
  const accessor_private_key = fs.readFileSync(config.keyPath + sid, 'utf8');
  db.addOrUpdateReference(reference_id, {
    namespace,
    identifier,
    accessor_private_key,
    accessor_public_key,
    ial,
    aal,
    response,
    mode,
    delay
  });

  try {

    const { request_id, accessor_id } = await API.createNewIdentity({
      reference_id,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/identity`,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      mode,
      accessor_type: 'RSA',
      accessor_public_key,
      //accessor_id,
      ial,
    });

    db.addOrUpdateReference(reference_id, {
      request_id,
      accessor_id,
    });

    return request_id;
  } catch (error) {
    db.removeReference(reference_id);
    throw error;
  }
}

async function createResponse({request_id, namespace, identifier, reference_group_code, mode, min_ial, min_aal}) {
  const user = reference_group_code ? 
    db.getUserByReferenceGroupCode(reference_group_code) :
    db.getUserByIdentifier(namespace, identifier);
  if (mode === 3 || mode === 2) {
    if (!user) {
      throw new Error('User is not found: ' + namespace + '/' + identifier);
    }

    const reference_id = uuid();
    try {
      const { request_message_padded_hash } = await API.getRequestMessagePaddedHash(
        request_id,
        user.accessorIds[0],
      );

    const { accessor_private_key } = db.getAccessor(user.accessorIds[0]);
    const signature = utils.createResponseSignature(
      accessor_private_key,
      request_message_padded_hash
    );

      await new Promise((resolve) => setTimeout(resolve, user.delay * 1000 || 0));
      await API.createIdpResponse({
        reference_id,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/response`,
        request_id: request_id,
        ial: user.ial,
        aal: user.aal,
        status: user.response, // 'accept' or 'reject'
        accessor_id: user.accessorIds[0],
        signature,
      });
      return reference_id;
    } catch (error) {
      throw error;
    }
  } else {
    const reference_id = uuid();
    const mockSignature = 'DXdc+d0MybjyJiQ6wChGdGZQXwMoh6EFePbGl1E5DYv0euhPfkauOrpVp99UwcnD00f/lZNXfaCMyJgTY1jRHEodg0WUY6s3UTPvepy9vAmJjLWPTwb7a5gMHfEWApvhi6TTOcIj2ciT62iPotzJIRNtm2Zm12eUJwypfwB0+vCjDNnxn1Uk43/OsHsC/s7kIyI93uzhrApEpI/y3cda0B1SSi+Jc31fPL7aQQm0Xxw3UtrJI8c1ENumZ0BrjtHNPxTruSXtQy6BIhO1srEyTTbVexgiK9mug2fxrblw+eC9vbPlnT1s6aEd/SOBJkujmFrKkco9v2zK642W8TagxQ==';
    
    try {
      if (user) {
        await new Promise((resolve) => setTimeout(resolve, user.delay * 1000 || 0));
      }

      await API.createIdpResponse({
        reference_id,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/callback/idp/response`,
        request_id: request_id,
        ial: user ? user.ial : min_ial,
        aal: user ? user.aal : min_aal,
        status: user ? user.response : 'accept',
        signature: mockSignature,
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
