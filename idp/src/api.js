import fetch from 'node-fetch';
import * as config from './config';

const apiBaseUrl = config.apiServerAddress + '/v4';

function logResponse(url, method, status, body, error) {
  console.log(
    `Received response from NDID API:
    URL: ${url} (${method})
    Status: ${status}\
    ${body ? '\nBody:\n' + JSON.stringify(body, null, 2) : ''}\
    ${error ? '\nError:\n' + JSON.stringify(error, null, 2) : ''}`
  );
}

export async function httpGet(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 500) {
        const errorJson = await response.json();
        logResponse(url, 'GET', response.status, null, errorJson);
        throw { status: response.status, body: errorJson };
      }
      throw response;
    }

    const responseJson = await response.json();
    logResponse(url, 'GET', response.status, responseJson);

    return responseJson;
  } catch (error) {
    throw error;
  }
}

export async function httpPost(url, body, expectResponseBody) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (
        response.status === 400 ||
        response.status === 500 ||
        response.status === 403
      ) {
        const errorJson = await response.json();
        logResponse(url, 'POST', response.status, null, errorJson);
        throw { status: response.status, body: errorJson };
      }
      throw response;
    }

    if (expectResponseBody) {
      const responseJson = await response.json();
      logResponse(url, 'POST', response.status, responseJson);
      return responseJson;
    }
    logResponse(url, 'POST', response.status);
  } catch (error) {
    throw error;
  }
}

export function getCallbackUrls() {
  return httpGet(`${apiBaseUrl}/idp/callback`);
}

export function setCallbackUrls({
  incoming_request_url,
  accessor_encrypt_url,
  error_url,
}) {
  return httpPost(`${apiBaseUrl}/idp/callback`, {
    incoming_request_url,
    accessor_encrypt_url,
    error_url,
  });
}

export function createIdpResponse({
  request_id,
  namespace,
  identifier,
  ial,
  aal,
  secret,
  status,
  signature,
  accessor_id,
  reference_id,
  callback_url,
}) {
  return httpPost(`${apiBaseUrl}/idp/response`, {
    request_id,
    namespace,
    identifier,
    ial,
    aal,
    secret,
    status,
    signature,
    accessor_id,
    reference_id,
    callback_url,
  });
}

export function createNewIdentity(data) {
  return httpPost(`${apiBaseUrl}/identity`, data, true);
}

export function updateMode(data) {
  return httpPost(
    `${apiBaseUrl}/identity/${data.namespace}/${data.identifier}/mode`,
    data,
    true
  );
}

export function updateIAL(namespace, identifier, data) {
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    data,
    false
  );
}

export function setDpkiCallbackUrl({ sign_url, master_sign_url, decrypt_url }) {
  return httpPost(`${apiBaseUrl}/node/callback`, {
    sign_url,
    master_sign_url,
    decrypt_url,
  });
}

export function getRequestMessagePaddedHash(request_id, accessor_id) {
  return httpGet(
    `${apiBaseUrl}/idp/request_message_padded_hash?request_id=${request_id}&accessor_id=${accessor_id}`
  );
}

export function addAccessor(namespace, identifier, data) {
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors`,
    data,
    true
  );
}

export function revokeAccessor(namespace, identifier, data) {
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessor_revoke`,
    data,
    false
  );
}

export function revokeAndAddAccessor(namespace, identifier, data) {
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessor_revoke_and_add`,
    data,
    true
  );
}

export function revokeAssociation(namespace, identifier, data) {
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/association_revoke`,
    data,
    false
  );
}

