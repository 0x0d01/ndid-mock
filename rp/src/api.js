import fetch from 'node-fetch';
import * as config from './config';

const apiServerAddress = config.apiServerAddress;

const apiBaseUrl = apiServerAddress + '/v3';

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

export function createRequest({
  mode,
  namespace,
  identifier,
  reference_id,
  idp_id_list,
  callback_url,
  data_request_list,
  request_message,
  min_ial,
  min_aal,
  min_idp,
  request_timeout,
  bypass_identity_check,
}) {
  return httpPost(
    `${apiBaseUrl}/rp/requests/${namespace}/${identifier}`,
    {
      mode,
      reference_id,
      idp_id_list,
      callback_url,
      data_request_list,
      request_message,
      min_ial,
      min_aal,
      min_idp,
      request_timeout,
      bypass_identity_check,
    },
    true
  );
}

export function removePrivateMessage(requestId) {
  return httpPost(`${apiBaseUrl}/utility/private_message_removal/${requestId}`);
}

export function removeDataFromAS(requestId) {
  return httpPost(`${apiBaseUrl}/rp/request_data_removal/${requestId}`);
}

export function closeRequest(body) {
  return httpPost(`${apiBaseUrl}/rp/request_close`, body);
}

export function getPrivateMessage(requestId) {
  return httpGet(`${apiBaseUrl}/utility/private_messages/${requestId}`);
}

export function getDataFromAS(requestId) {
  return httpGet(`${apiBaseUrl}/request_data/${requestId}`);
}
